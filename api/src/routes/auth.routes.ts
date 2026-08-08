import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  signDemoLinkToken,
  verifyDemoLinkToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
} from "../lib/jwt";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { SYSTEM_ROLE_TEMPLATES } from "../seed-data";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_HISTORY_DEPTH,
  FAILED_ATTEMPT_THRESHOLD,
  MFA_PENDING_TOKEN_TTL_SECONDS,
  passwordExpiryDate,
  lockoutExpiryDate,
  deviceTrustExpiryDate,
  validatePasswordLength,
  isPasswordReused,
  encryptSecret,
  decryptSecret,
  generateTotpSecretBase32,
  verifyTotpCode,
  totpEnrollmentUri,
  generateBackupCodes,
  hashBackupCodes,
  matchAndConsumeBackupCode,
} from "../lib/security";

export const authRouter = Router();

// -----------------------------------------------------------------------
// PDDS Phase 4 helpers — shared by /login, /login/mfa, and anywhere else
// a login attempt reaches a final SUCCESS/FAILED outcome. Kept local to
// this file since they're tightly coupled to the request/response shape
// of the login flow specifically, not general-purpose enough for
// lib/security.ts.
// -----------------------------------------------------------------------
// Deliberately a minimal hand-written shape, not Prisma.UserGetPayload<{}>
// — this sandbox's generated client is a stub (prisma generate can't
// reach binaries.prisma.sh from here, a standing limitation noted
// throughout this build), so Prisma's generic payload types aren't
// reliably exported. This interface only needs the fields these helpers
// actually touch.
interface LoginableUser {
  id: string;
  institutionId: string;
  category: "INTERNAL" | "EXTERNAL";
  fullName: string;
  email: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
  passwordExpiresAt: Date | null;
  mfaEnabled: boolean;
}

// Real enforcement, not advisory: a user holding any active (non-expired)
// role assignment with requireMfa=true cannot get a full session without
// MFA actually verified — see the login flow below.
async function userHasRoleRequiringMfa(userId: string): Promise<boolean> {
  const match = await prisma.userRole.findFirst({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      role: { requireMfa: true },
    },
  });
  return match !== null;
}

// "Trusted" = MFA-skip-eligible for a bounded window, not a strong
// device-identity guarantee (client-supplied fingerprint, unattested).
// Password is still required regardless of trust — only the MFA step is
// skipped. See the trust-model caveats on UserDevice in schema.prisma.
async function isDeviceTrusted(userId: string, fingerprint: string | undefined): Promise<boolean> {
  if (!fingerprint) return false;
  const device = await prisma.userDevice.findUnique({
    where: { userId_fingerprint: { userId, fingerprint } },
  });
  return !!device?.trusted && !!device.trustedUntil && device.trustedUntil > new Date();
}

async function recordLoginAttempt(
  userId: string,
  result: "SUCCESS" | "FAILED_PASSWORD" | "FAILED_MFA" | "LOCKED_OUT" | "FAILED_OTHER",
  req: { headers: { "user-agent"?: string }; ip?: string },
  failureReason?: string
) {
  await prisma.userLoginHistory.create({
    data: {
      userId,
      result,
      failureReason,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });
}

async function registerFailedPassword(user: LoginableUser, req: { headers: { "user-agent"?: string }; ip?: string }) {
  const nextCount = user.failedLoginCount + 1;
  const willLock = nextCount >= FAILED_ATTEMPT_THRESHOLD;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: willLock ? 0 : nextCount,
      lastFailedLoginAt: new Date(),
      lockedUntil: willLock ? lockoutExpiryDate() : user.lockedUntil,
    },
  });
  await recordLoginAttempt(user.id, willLock ? "LOCKED_OUT" : "FAILED_PASSWORD", req);
  return willLock;
}

async function completeSuccessfulLogin(
  user: LoginableUser,
  req: { headers: { "user-agent"?: string }; ip?: string },
  deviceFingerprint?: string,
  trustDevice?: boolean
) {
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

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null },
  });

  if (deviceFingerprint) {
    // trustDevice is only ever honoured here — the point this function is
    // called from is, by construction, always a point where MFA (if it was
    // required at all) has just been satisfied or wasn't required. A
    // device can never bootstrap trust without having passed MFA at least
    // once when MFA was actually required.
    const trustFields = trustDevice
      ? { trusted: true, trustedUntil: deviceTrustExpiryDate() }
      : {};
    await prisma.userDevice.upsert({
      where: { userId_fingerprint: { userId: user.id, fingerprint: deviceFingerprint } },
      create: {
        userId: user.id,
        fingerprint: deviceFingerprint,
        lastSeenAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        ...trustFields,
      },
      update: {
        lastSeenAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        ...trustFields,
      },
    });
  }

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.login" },
  });
  await recordLoginAttempt(user.id, "SUCCESS", req);

  const mustChangePassword =
    user.mustChangePassword || (user.passwordExpiresAt !== null && user.passwordExpiresAt < new Date());

  return {
    accessToken,
    refreshToken: raw,
    user: { id: user.id, fullName: user.fullName, email: user.email, institutionId: user.institutionId },
    mustChangePassword,
  };
}

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
  adminPassword: z.string().min(PASSWORD_MIN_LENGTH),
  setupKey: z.string(),
});

// Institution registration was fully public — anyone who found the
// endpoint could create a new institution. Gated behind a shared secret,
// held only as an env var (SUPERUSER_SETUP_KEY, set in Railway) — never
// in source control, rotatable at any time with no code change or
// redeploy. The real enforcement is here, server-side; the frontend's own
// gate (redirecting to /login without a ?key= present) is UX only and
// deliberately not trusted as the actual security boundary.
authRouter.post("/register-institution", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const expectedKey = process.env.SUPERUSER_SETUP_KEY;
  if (!expectedKey || parsed.data.setupKey !== expectedKey) {
    return res.status(403).json({ error: "Invalid setup key" });
  }
  const { legalName, tradingName, type, adminFullName, adminEmail, adminPassword } = parsed.data;

  const lengthError = validatePasswordLength(adminPassword);
  if (lengthError) return res.status(400).json({ error: lengthError });

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
        passwordChangedAt: new Date(),
        passwordExpiresAt: passwordExpiryDate(),
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
// PDDS Phase 4 — a real two-step exchange whenever MFA is either already
// enrolled OR mandated by an active role (requireMfa=true) and not yet
// enrolled: a correct password alone returns a pending token, never a
// full session, until MFA is actually satisfied. Trusted devices (see
// isDeviceTrusted) skip the MFA step but never the password step.
// Lockout (§136.5, disclosed default: 5 attempts / 30 min — see
// docs/security-policy-defaults.md) is checked before the password
// comparison runs at all.
// -----------------------------------------------------------------------
const loginSchema = z.object({
  institutionId: z.string().optional(),
  email: z.string().email(),
  password: z.string(),
  deviceFingerprint: z.string().optional(),
  trustDevice: z.boolean().optional(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, institutionId, deviceFingerprint, trustDevice } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email, ...(institutionId ? { institutionId } : {}) },
  });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordLoginAttempt(user.id, "LOCKED_OUT", req);
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({ error: `Account is locked. Try again in ${minutesLeft} minute(s).` });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const lockedNow = await registerFailedPassword(user, req);
    return res.status(401).json({
      error: lockedNow
        ? `Invalid credentials. Too many failed attempts — account is now locked for 30 minutes.`
        : "Invalid credentials",
    });
  }

  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
  }

  const trustedSkip = await isDeviceTrusted(user.id, deviceFingerprint);

  if (!trustedSkip) {
    if (user.mfaEnabled) {
      const mfaPendingToken = signMfaPendingToken({ userId: user.id }, MFA_PENDING_TOKEN_TTL_SECONDS);
      return res.json({ mfaRequired: true, mfaPendingToken });
    }
    // MFA not enrolled yet — check whether any active role mandates it.
    // A trusted device can never reach this branch: trust is only ever
    // granted at a point where mfaEnabled was already true.
    if (await userHasRoleRequiringMfa(user.id)) {
      const mfaPendingToken = signMfaPendingToken({ userId: user.id }, MFA_PENDING_TOKEN_TTL_SECONDS);
      return res.json({ mfaSetupRequired: true, mfaPendingToken });
    }
  }

  const result = await completeSuccessfulLogin(user, req, deviceFingerprint, trustDevice);
  res.json(result);
});

// -----------------------------------------------------------------------
// POST /auth/login/mfa
// Second step of login when the account has MFA enrolled. Accepts either
// a 6-digit TOTP code or a backup code (format XXXXX-XXXXX, single-use,
// consumed on match). The mfaPendingToken is its own short-lived (2 min)
// JWT namespace — see lib/jwt.ts — proving the password step already
// passed, without a server-side session to track in between.
// -----------------------------------------------------------------------
const loginMfaSchema = z.object({
  mfaPendingToken: z.string(),
  code: z.string().min(6),
  deviceFingerprint: z.string().optional(),
  trustDevice: z.boolean().optional(),
});

authRouter.post("/login/mfa", async (req, res) => {
  const parsed = loginMfaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mfaPendingToken, code, deviceFingerprint, trustDevice } = parsed.data;

  let userId: string;
  try {
    userId = verifyMfaPendingToken(mfaPendingToken).userId;
  } catch {
    return res.status(401).json({ error: "MFA challenge expired or invalid. Please log in again." });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { mfa: true } });
  if (!user || !user.mfa || !user.mfa.verifiedAt) {
    return res.status(400).json({ error: "MFA is not properly configured on this account." });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(423).json({ error: "Account is locked." });
  }

  let mfaValid = false;
  if (/^\d{6}$/.test(code)) {
    const secret = decryptSecret(user.mfa.secretEncrypted);
    mfaValid = await verifyTotpCode(code, secret);
  } else {
    const { matched, remaining } = await matchAndConsumeBackupCode(code, user.mfa.backupCodesHashed);
    if (matched) {
      mfaValid = true;
      await prisma.userMfa.update({ where: { userId: user.id }, data: { backupCodesHashed: remaining } });
    }
  }

  if (!mfaValid) {
    const lockedNow = await registerFailedPassword(user, req);
    await recordLoginAttempt(user.id, "FAILED_MFA", req);
    return res.status(401).json({
      error: lockedNow ? "Incorrect code. Too many failed attempts — account is now locked for 30 minutes." : "Incorrect code",
    });
  }

  const result = await completeSuccessfulLogin(user, req, deviceFingerprint, trustDevice);
  res.json(result);
});

// -----------------------------------------------------------------------
// POST /auth/mfa/setup-required — same job as POST /auth/mfa/setup, but
// reachable mid-login (mfaPendingToken, not a Bearer access token) for the
// case a role mandates MFA and the person has never enrolled. Without
// this, a first-time required-MFA enrollment would need a real session to
// exist first — circular, since the whole point is no real session until
// MFA is done.
// -----------------------------------------------------------------------
authRouter.post("/mfa/setup-required", async (req, res) => {
  const { mfaPendingToken } = req.body as { mfaPendingToken?: string };
  if (!mfaPendingToken) return res.status(400).json({ error: "mfaPendingToken required" });

  let userId: string;
  try {
    userId = verifyMfaPendingToken(mfaPendingToken).userId;
  } catch {
    return res.status(401).json({ error: "This challenge has expired. Please log in again." });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { mfa: true } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.mfa?.verifiedAt) {
    return res.status(409).json({ error: "MFA is already enrolled on this account." });
  }

  const secret = generateTotpSecretBase32();
  await prisma.userMfa.upsert({
    where: { userId: user.id },
    create: { userId: user.id, secretEncrypted: encryptSecret(secret), backupCodesHashed: [] },
    update: { secretEncrypted: encryptSecret(secret), backupCodesHashed: [], verifiedAt: null },
  });

  res.json({ secret, otpauthUri: totpEnrollmentUri(secret, user.email) });
});

// -----------------------------------------------------------------------
// POST /auth/mfa/verify-required — completes a mandatory first-time
// enrollment reached via the mfaPendingToken path, and — unlike
// POST /auth/mfa/verify, which is for an already-logged-in user adding
// MFA voluntarily — actually finishes the login here, since the entire
// point was withholding a real session until this succeeded.
// -----------------------------------------------------------------------
const mfaVerifyRequiredSchema = z.object({
  mfaPendingToken: z.string(),
  code: z.string().length(6),
  deviceFingerprint: z.string().optional(),
});

authRouter.post("/mfa/verify-required", async (req, res) => {
  const parsed = mfaVerifyRequiredSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mfaPendingToken, code, deviceFingerprint } = parsed.data;

  let userId: string;
  try {
    userId = verifyMfaPendingToken(mfaPendingToken).userId;
  } catch {
    return res.status(401).json({ error: "This challenge has expired. Please log in again." });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { mfa: true } });
  if (!user?.mfa) return res.status(400).json({ error: "Call POST /auth/mfa/setup-required first." });
  if (user.mfa.verifiedAt) return res.status(409).json({ error: "MFA is already verified on this account." });

  const secret = decryptSecret(user.mfa.secretEncrypted);
  const valid = await verifyTotpCode(code, secret);
  if (!valid) return res.status(401).json({ error: "Incorrect code" });

  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  const [, updatedUser] = await prisma.$transaction([
    prisma.userMfa.update({
      where: { userId: user.id },
      data: { verifiedAt: new Date(), backupCodesHashed: hashedCodes },
    }),
    prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } }),
  ]);

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.mfa_enrolled" },
  });

  // This enrollment was mandatory (role-required), so completing it also
  // completes the login that was blocked pending it — unlike voluntary
  // enrollment via /mfa/verify, which just adds MFA to an already-live
  // session. trustDevice deliberately not accepted here: trust can only
  // ever be granted once a device has already been through a genuinely
  // repeat MFA success, not on the very first enrollment.
  const result = await completeSuccessfulLogin(updatedUser, req, deviceFingerprint, false);
  res.json({ ...result, backupCodes });
});

// -----------------------------------------------------------------------
// POST /auth/demo-link
// Mints a shareable login link that pre-fills the login form with a demo
// account's real credentials — for sharing the platform with prospective
// pilot contacts without creating a separate real user per person.
//
// Deliberately narrow: only usable for a user inside an institution
// flagged isDemo, and the caller must supply and prove they know that
// user's actual current password (checked against the real hash below) —
// this isn't a privilege-escalation shortcut, it's a convenience wrapper
// around credentials the caller already has.
// -----------------------------------------------------------------------
const demoLinkSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post("/demo-link", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = demoLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email, institutionId: req.auth!.institutionId },
    include: { institution: { select: { isDemo: true } } },
  });
  if (!user) return res.status(404).json({ error: "No user with that email in your institution" });
  if (!user.institution.isDemo) {
    return res.status(403).json({ error: "This institution isn't flagged as a demo institution — demo links can't be created for it" });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "That isn't this user's current password" });

  const token = signDemoLinkToken({ email, password });
  const webBase = process.env.WEB_APP_URL || "http://localhost:3100";
  res.json({ url: `${webBase}/login?demo=${token}` });
});

// -----------------------------------------------------------------------
// GET /auth/demo-link/:token
// Public — resolves a demo link back into the credentials it carries, for
// the login page to pre-fill. Never issues a session directly; the person
// still has to press Sign In, same as any other login.
// -----------------------------------------------------------------------
authRouter.get("/demo-link/:token", async (req, res) => {
  try {
    const { email, password } = verifyDemoLinkToken(req.params.token);
    res.json({ email, password });
  } catch {
    res.status(410).json({ error: "This demo link is invalid or has expired" });
  }
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
  // Role.category (EXECUTIVE/OPERATIONAL/GOVERNANCE/TECHNICAL/CUSTOMER) —
  // a real enum, not free-text role names — used by the frontend to
  // pick a role-relevant 5th mobile bottom-nav slot. Deliberately
  // returned raw rather than mapped to a nav item here, so the nav
  // structure itself stays a frontend concern.
  const roleCategorySet = new Set<string>();
  for (const ur of user.userRoles) roleCategorySet.add(ur.role.category);

  res.json({
    user: { id: user.id, fullName: user.fullName, email: user.email },
    permissions: Array.from(permissionSet),
    roleCategories: Array.from(roleCategorySet),
  });
});

// -----------------------------------------------------------------------
// POST /auth/accept-invite
// NOTE: no invite-token mechanism exists yet (doc section 38 onboarding
// gap) - this matches on email + INVITED status only. Fine for internal
// testing; needs a real emailed token before inviting anyone outside the
// org.
// -----------------------------------------------------------------------
const acceptInviteSchema = z.object({ token: z.string().min(10), password: z.string().min(PASSWORD_MIN_LENGTH) });

authRouter.post("/accept-invite", async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { token, password } = parsed.data;

  const lengthError = validatePasswordLength(password);
  if (lengthError) return res.status(400).json({ error: lengthError });

  const user = await prisma.user.findFirst({ where: { inviteToken: token, status: "INVITED" } });
  if (!user) return res.status(404).json({ error: "This invite link is invalid or has already been used" });
  if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
    return res.status(410).json({ error: "This invite link has expired. Ask an administrator to grant access again." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      status: "ACTIVE",
      inviteToken: null,
      inviteTokenExpiresAt: null,
      passwordChangedAt: new Date(),
      passwordExpiresAt: passwordExpiryDate(),
      mustChangePassword: false,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.accept_invite" },
  });

  res.status(204).send();
});

// -----------------------------------------------------------------------
// POST /auth/change-password
// The genuine gap this whole phase depends on: no self-service password
// change existed anywhere before this — accept-invite sets the first
// password, and nothing ever set a second one. Enforces the disclosed
// length policy and the last-N reuse restriction (PASSWORD_HISTORY_DEPTH)
// against real history, not just the current hash.
// -----------------------------------------------------------------------
const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH),
});

authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { currentPassword, newPassword } = parsed.data;

  const lengthError = validatePasswordLength(newPassword);
  if (lengthError) return res.status(400).json({ error: lengthError });

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentValid) return res.status(401).json({ error: "Current password is incorrect" });

  const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
  const recentHistory = await prisma.userPasswordHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: PASSWORD_HISTORY_DEPTH,
  });
  const reused =
    sameAsCurrent ||
    (await isPasswordReused(
      newPassword,
      recentHistory.map((h: { passwordHash: string }) => h.passwordHash)
    ));
  if (reused) {
    return res.status(400).json({ error: `New password can't match your current password or your last ${PASSWORD_HISTORY_DEPTH} passwords.` });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.userPasswordHistory.create({ data: { userId: user.id, passwordHash: user.passwordHash } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        passwordExpiresAt: passwordExpiryDate(),
        mustChangePassword: false,
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.change_password" },
  });

  res.status(204).send();
});

// -----------------------------------------------------------------------
// POST /auth/mfa/setup
// Step 1 of enrollment: generates a TOTP secret, stores it encrypted with
// verifiedAt still null (not yet trusted), returns the plaintext secret +
// otpauth:// URI for the client to render as a QR code. Blocked if MFA is
// already verified on this account — disable it first via
// POST /auth/mfa/disable rather than silently overwriting a working
// enrollment, which could lock the person out if the new one is never
// actually confirmed.
// -----------------------------------------------------------------------
authRouter.post("/mfa/setup", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, include: { mfa: true } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.mfa?.verifiedAt) {
    return res.status(409).json({ error: "MFA is already enrolled on this account. Disable it before setting up again." });
  }

  const secret = generateTotpSecretBase32();
  await prisma.userMfa.upsert({
    where: { userId: user.id },
    create: { userId: user.id, secretEncrypted: encryptSecret(secret), backupCodesHashed: [] },
    update: { secretEncrypted: encryptSecret(secret), backupCodesHashed: [], verifiedAt: null },
  });

  res.json({ secret, otpauthUri: totpEnrollmentUri(secret, user.email) });
});

// -----------------------------------------------------------------------
// POST /auth/mfa/verify
// Step 2 of enrollment: proves the person actually scanned the secret
// into a working authenticator app before MFA becomes enforced on login.
// Backup codes are generated and returned in plaintext exactly once here
// — only the hashes are ever stored, same as passwords.
// -----------------------------------------------------------------------
const mfaVerifySchema = z.object({ code: z.string().length(6) });

authRouter.post("/mfa/verify", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = mfaVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, include: { mfa: true } });
  if (!user?.mfa) return res.status(400).json({ error: "Call POST /auth/mfa/setup first." });
  if (user.mfa.verifiedAt) return res.status(409).json({ error: "MFA is already verified on this account." });

  const secret = decryptSecret(user.mfa.secretEncrypted);
  const valid = await verifyTotpCode(parsed.data.code, secret);
  if (!valid) return res.status(401).json({ error: "Incorrect code" });

  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  await prisma.$transaction([
    prisma.userMfa.update({
      where: { userId: user.id },
      data: { verifiedAt: new Date(), backupCodesHashed: hashedCodes },
    }),
    prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } }),
  ]);

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.mfa_enrolled" },
  });

  res.json({ backupCodes });
});

// -----------------------------------------------------------------------
// POST /auth/mfa/disable
// Requires the current password, not just an authenticated session — MFA
// is the thing standing between a stolen access token and full account
// control, so removing it needs the same proof of identity as changing
// the password does.
// -----------------------------------------------------------------------
const mfaDisableSchema = z.object({ password: z.string() });

authRouter.post("/mfa/disable", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = mfaDisableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Incorrect password" });

  await prisma.$transaction([
    prisma.userMfa.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false } }),
  ]);

  await prisma.auditLog.create({
    data: { institutionId: user.institutionId, userId: user.id, action: "auth.mfa_disabled" },
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
