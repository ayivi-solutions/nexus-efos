import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const institutionRouter = Router();
institutionRouter.use(requireAuth);

institutionRouter.get("/me", async (req: AuthedRequest, res) => {
  const institution = await prisma.institution.findUnique({
    where: { id: req.auth!.institutionId },
    include: { branches: true },
  });
  res.json({ institution });
});

// Branch directory (post-onboarding management, doc §36)
institutionRouter.get("/branches", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const { includeArchived } = req.query as { includeArchived?: string };
  const branches = await prisma.branch.findMany({
    where: { institutionId: req.auth!.institutionId, ...(includeArchived === "true" ? {} : { archived: false }) },
    orderBy: { name: "asc" },
  });
  res.json({ branches });
});

const newBranchSchema = z.object({ name: z.string().min(1), code: z.string().min(1), region: z.string().optional() });

institutionRouter.post("/branches", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const parsed = newBranchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const branch = await prisma.branch.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "branch.create", resource: "branch", resourceId: branch.id },
  });
  res.status(201).json({ branch });
});

// CRUAA — Update
const updateBranchSchema = z.object({ name: z.string().min(1).optional(), code: z.string().min(1).optional(), region: z.string().optional().nullable() });

institutionRouter.patch("/branches/:id", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const parsed = updateBranchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.branch.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Branch not found" });

  const branch = await prisma.branch.update({ where: { id: existing.id }, data: parsed.data });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "branch.update", resource: "branch", resourceId: branch.id },
  });
  res.json({ branch });
});

// CRUAA — Archive (Head Office is protected — cannot be archived)
institutionRouter.post("/branches/:id/archive", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const branch = await prisma.branch.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!branch) return res.status(404).json({ error: "Branch not found" });
  if (branch.isHeadOffice) return res.status(400).json({ error: "The Head Office branch cannot be archived" });

  await prisma.branch.update({ where: { id: branch.id }, data: { archived: true, archivedAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "branch.archive", resource: "branch", resourceId: branch.id },
  });
  res.json({ ok: true });
});

institutionRouter.post("/branches/:id/unarchive", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const branch = await prisma.branch.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { archived: false, archivedAt: null },
  });
  if (branch.count === 0) return res.status(404).json({ error: "Branch not found" });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "branch.unarchive", resource: "branch", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

// Staff directory (doc §38 — needed to see who can be assigned roles)
institutionRouter.get("/users", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const users = await prisma.user.findMany({
    where: { institutionId: req.auth!.institutionId },
    select: { id: true, fullName: true, email: true, status: true, userRoles: { include: { role: true, branch: true } } },
    orderBy: { fullName: "asc" },
  });
  res.json({ users });
});

// CRUAA — Archive for User = revoke system access. This closes the gap
// where removing all roles still left a login-capable account.
institutionRouter.post("/users/:id/suspend", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "user.suspend", resource: "user", resourceId: user.id },
  });
  res.json({ ok: true });
});

institutionRouter.post("/users/:id/reinstate", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "user.reinstate", resource: "user", resourceId: user.id },
  });
  res.json({ ok: true });
});

// Step 2 — institutional details
const detailsSchema = z.object({ regulatorId: z.string().optional(), region: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional() });

institutionRouter.patch("/onboarding/details", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = detailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const institution = await prisma.institution.update({
    where: { id: req.auth!.institutionId },
    data: { ...parsed.data, onboardingStep: 3 },
  });
  res.json({ institution, nextStep: "onboarding-branches" });
});

// Step 3 — additional branches
const branchSchema = z.object({ name: z.string().min(1), code: z.string().min(1), region: z.string().optional() });

institutionRouter.post("/onboarding/branches", requirePermission("branches.administer"), async (req: AuthedRequest, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const branch = await prisma.branch.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  await prisma.institution.update({ where: { id: req.auth!.institutionId }, data: { onboardingStep: 4 } });
  res.status(201).json({ branch, nextStep: "onboarding-staff" });
});

// Step 4 — invite staff (bootstraps Employee + User together)
const inviteSchema = z.object({ fullName: z.string().min(2), email: z.string().email(), roleId: z.string(), branchId: z.string().optional() });
const INVITE_TOKEN_TTL_DAYS = 7;

// Bootstraps User + UserRole + Employee together atomically (fixed: was
// three separate creates, so a mid-way failure left an orphaned, role-less
// user that silently blocked any retry with the same email). Also now
// generates a real invite token — this endpoint had fallen out of sync
// with employee.routes.ts's Grant Access flow, which got the invite-token
// fix applied earlier but this one, the one actually used for onboarding's
// very first staff invite, never did — invited users had no way to ever
// accept and set a password. Both found via a live smoke test after the
// PDDS Phase 1+2 migration; neither is a schema defect.
institutionRouter.post("/onboarding/staff", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fullName, email, roleId, branchId } = parsed.data;

  const role = await prisma.role.findFirst({ where: { id: roleId, institutionId: req.auth!.institutionId } });
  if (!role) return res.status(404).json({ error: "Role not found" });

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { institutionId: req.auth!.institutionId, fullName, email, passwordHash: "", status: "INVITED", inviteToken, inviteTokenExpiresAt },
    });
    await tx.userRole.create({ data: { userId: u.id, roleId, branchId } });
    await tx.employee.create({ data: { institutionId: req.auth!.institutionId, fullName, email, branchId, userId: u.id } });
    return u;
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "institution.staff_invite", resource: "user", resourceId: user.id },
  });

  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3100";
  res.status(201).json({ user, inviteLink: `${webOrigin}/accept-invite?token=${inviteToken}` });
});

// Step 5 — go live
institutionRouter.post("/onboarding/go-live", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const institution = await prisma.institution.update({
    where: { id: req.auth!.institutionId },
    data: { onboardingStep: 5, status: "ACTIVE" },
  });
  await prisma.auditLog.create({
    data: { institutionId: institution.id, userId: req.auth!.userId, action: "institution.go_live" },
  });
  res.json({ institution });
});
