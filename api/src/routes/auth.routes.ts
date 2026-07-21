import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken, generateRefreshToken, hashRefreshToken } from "../lib/jwt";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { SYSTEM_ROLE_TEMPLATES } from "../seed-data";

export const authRouter = Router();

// -----------------------------------------------------------------------
// POST /auth/register-institution
// Doc section 14.3 institution types + section 38 - first user is always
// an Executive-category admin so the institution can immediately assign
// further roles.
// -----------------------------------------------------------------------
const registerSchema = z.object({
  legalName: z.string().min(2),
  tradingName: z.string().optional(),
  type: z.enum([
    "INDIVIDUAL_SUSU_OPERATOR",
    "MICROFINANCE_INSTITUTION",
    "SAVINGS_AND_LOANS_COMPANY",
    "CREDIT_UNION",
    "COOPERATIVE_SOCIETY",
    "RURAL_COMMUNITY_BANK",
    "AGENCY_BANKING_NETWORK",
    "DIGITAL_LENDING_INSTITUTION",
  ]),
  adminFullName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

authRouter.post("/register-institution", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { legalName, tradingName, type, adminFullName, adminEmail, adminPassword } = parsed.data;

  const existing = await prisma.institution.findFirst({ where: { legalName } });
  if (existing) return res.status(409).json({ error: "Institution already registered" });

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const institution = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const inst = await tx.institution.create({
      data: { legalName, tradingName, type, onboardingStep: 2 },
    });

    const headOffice = await tx.branch.create({
      data: { institutionId: inst.id, name: "Head Office", code: "HQ", isHeadOffice: true },
    });

    // Seed institution-scoped copies of the system role templates
    // (doc section 38.7 - Executive / Operational / Governance / Technical / Customer roles)
    const roleRecords = await Promise.all(
      SYSTEM_ROLE_TEMPLATES.map((tmpl) =>
        tx.role.create({
          data: {
            institutionId: inst.id,
            name: tmpl.name,
            category: tmpl.category,
            description: tmpl.description,
            isSystem: true,
          },
        })
      )
    );

    // Fetch every permission ONCE, not per-role (avoids N sequential queries
    // inside the transaction against the pooled connection).
    const allPermissions = await tx.permission.findMany();
    const permIdByCode: Record<string, string> = {};
    for (const p of allPermissions) permIdByCode[p.code] = p.id;

    const rolePermissionRows: { roleId: string; permissionId: string }[] = [];
    for (const tmpl of SYSTEM_ROLE_TEMPLATES) {
      const roleRecord = roleRecords.find((r) => r.name === tmpl.name)!;
      for (const code of tmpl.permissionCodes) {
        const permissionId = permIdByCode[code];
        if (permissionId) rolePermissionRows.push({ roleId: roleRecord.id, permissionId });
      }
    }
    await tx.rolePermission.createMany({ data: rolePermissionRows, skipDuplicates: true });

    const adminRole = roleRecords.find((r) => r.name === "Chief Executive Officer")!;

    const admin = await tx.user.create({
      data: {
        institutionId: inst.id,
        fullName: adminFullName,
        email: adminEmail,
        passwordHash,
        category: "INTERNAL",
        status: "ACTIVE",
      },
    });

    await tx.userRole.create({
      data: { userId: admin.id, roleId: adminRole.id, branchId: headOffice.id },
    });

    await tx.auditLog.create({
      data: {
        institutionId: inst.id,
        userId: admin.id,
        action: "institution.register",
        resource: "institution",
        resourceId: inst.id,
      },
    });

    return inst;
  },
  { timeout: 15000 });

  res.status(201).json({ institution, nextStep: "onboarding-details" });
});

// -----------------------------------------------------------------------
// POST /auth/login
// -----------------------------------------------------------------------
const loginSchema = z.object({
  institutionId: z.string().optional(),
  email: z.string().email(),
  password: z.string(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, institutionId } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email, ...(institutionId ? { institutionId } : {}) },
  });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
  }

  const accessToken = signAccessToken({
    userId: user.id,
    institutionId: user.institutionId,
    category: user.category,
  });
  const { raw, hash, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.login" },
  });

  res.json({
    accessToken,
    refreshToken: raw,
    user: { id: user.id, fullName: user.fullName, email: user.email, institutionId: user.institutionId },
  });
});

// -----------------------------------------------------------------------
// POST /auth/refresh
// -----------------------------------------------------------------------
authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

  const hash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: "Refresh token invalid or expired" });
  }

  const accessToken = signAccessToken({
    userId: stored.user.id,
    institutionId: stored.user.institutionId,
    category: stored.user.category,
  });

  res.json({ accessToken });
});

// -----------------------------------------------------------------------
// GET /auth/me
// Current user + their effective (deduped, non-expired) permission codes
// across all active role assignments — used to drive role-aware nav.
// -----------------------------------------------------------------------
authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      userRoles: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const permissionSet = new Set<string>();
  for (const ur of user.userRoles) {
    for (const rp of ur.role.rolePermissions) permissionSet.add(rp.permission.code);
  }

  res.json({
    user: { id: user.id, fullName: user.fullName, email: user.email },
    permissions: Array.from(permissionSet),
  });
});

// -----------------------------------------------------------------------
// POST /auth/accept-invite
// NOTE: no invite-token mechanism exists yet (doc section 38 onboarding
// gap) - this matches on email + INVITED status only. Fine for internal
// testing; needs a real emailed token before inviting anyone outside the
// org.
// -----------------------------------------------------------------------
const acceptInviteSchema = z.object({ token: z.string().min(10), password: z.string().min(8) });

authRouter.post("/accept-invite", async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { token, password } = parsed.data;

  const user = await prisma.user.findFirst({ where: { inviteToken: token, status: "INVITED" } });
  if (!user) return res.status(404).json({ error: "This invite link is invalid or has already been used" });
  if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
    return res.status(410).json({ error: "This invite link has expired. Ask an administrator to grant access again." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: "ACTIVE", inviteToken: null, inviteTokenExpiresAt: null },
  });

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.accept_invite" },
  });

  res.status(204).send();
});

// -----------------------------------------------------------------------
// POST /auth/logout
// -----------------------------------------------------------------------
authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    const hash = hashRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash },
      data: { revokedAt: new Date() },
    });
  }
  res.status(204).send();
});
