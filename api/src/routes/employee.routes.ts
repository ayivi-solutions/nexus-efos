import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const employeeRouter = Router();
employeeRouter.use(requireAuth);

employeeRouter.get("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { includeArchived } = req.query as { includeArchived?: string };
  const employees = await prisma.employee.findMany({
    where: { institutionId: req.auth!.institutionId, ...(includeArchived === "true" ? {} : { status: "ACTIVE" }) },
    include: { branch: true, user: { include: { userRoles: { include: { role: true, branch: true } } } } },
    orderBy: { fullName: "asc" },
  });
  res.json({ employees });
});

const createSchema = z.object({ fullName: z.string().min(2), email: z.string().email(), branchId: z.string().optional() });

employeeRouter.post("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await prisma.employee.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "employee.create", resource: "employee", resourceId: employee.id },
  });
  res.status(201).json({ employee });
});

// CRUAA — Update
const updateSchema = z.object({ fullName: z.string().min(2).optional(), email: z.string().email().optional(), branchId: z.string().optional().nullable() });

employeeRouter.patch("/:id", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  const employee = await prisma.employee.update({ where: { id: existing.id }, data: parsed.data });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "employee.update", resource: "employee", resourceId: employee.id },
  });
  res.json({ employee });
});

// CRUAA — Archive. Fail-secure: also suspends linked system access if any
// exists, so offboarding an employee can't leave a live login behind.
employeeRouter.post("/:id/archive", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const employee = await prisma.employee.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  await prisma.employee.update({ where: { id: employee.id }, data: { status: "INACTIVE" } });

  if (employee.userId) {
    await prisma.user.update({ where: { id: employee.userId }, data: { status: "SUSPENDED" } });
    await prisma.refreshToken.updateMany({ where: { userId: employee.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "employee.archive", resource: "employee", resourceId: employee.id, metadata: { cascadedUserSuspension: !!employee.userId } },
  });
  res.json({ ok: true });
});

// Unarchive restores the Employee record only — system access, if any was
// suspended, must be reinstated separately via POST /institutions/users/:id/reinstate.
employeeRouter.post("/:id/unarchive", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const employee = await prisma.employee.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "ACTIVE" },
  });
  if (employee.count === 0) return res.status(404).json({ error: "Employee not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "employee.unarchive", resource: "employee", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

const grantAccessSchema = z.object({ roleId: z.string(), branchId: z.string().optional() });
const INVITE_TOKEN_TTL_DAYS = 7;

employeeRouter.post("/:id/grant-access", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = grantAccessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await prisma.employee.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (employee.userId) return res.status(409).json({ error: "This employee already has system access" });

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: { institutionId: req.auth!.institutionId, fullName: employee.fullName, email: employee.email, passwordHash: "", status: "INVITED", inviteToken, inviteTokenExpiresAt },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: parsed.data.roleId, branchId: parsed.data.branchId } });
  await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "employee.grant_access", resource: "employee", resourceId: employee.id },
  });

  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3100";
  res.status(201).json({ user, inviteLink: `${webOrigin}/accept-invite?token=${inviteToken}` });
});
