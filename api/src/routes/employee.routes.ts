import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { checkVersion, VersionConflictError } from "../lib/optimisticLock";
import { matchRules, executeMatchedRules } from "../lib/businessRules";

export const employeeRouter = Router();
employeeRouter.use(requireAuth);

employeeRouter.get("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { includeArchived } = req.query as { includeArchived?: string };
  const employees = await prisma.employee.findMany({
    where: { institutionId: req.auth!.institutionId, ...(includeArchived === "true" ? {} : { status: "ACTIVE" }) },
    include: {
      branch: true,
      user: { include: { userRoles: { include: { role: true, branch: true } } } },
      reportingManager: { select: { id: true, fullName: true } },
      department: true,
      position: true,
    },
    orderBy: { fullName: "asc" },
  });
  res.json({ employees });
});

// Technical Spec §71 Employee Entity Architecture — real HR fields
// alongside the minimal set used since Employee Master was first built.
const employmentTypeEnum = z.enum(["PERMANENT", "CONTRACT", "TEMPORARY", "INTERN", "CONSULTANT"]);

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  branchId: z.string().optional(),
  employeeNumber: z.string().optional(),
  employmentType: employmentTypeEnum.optional(),
  departmentId: z.string().optional(),
  division: z.string().optional(),
  positionId: z.string().optional(),
  grade: z.string().optional(),
  employmentDate: z.string().datetime().optional(),
  confirmationDate: z.string().datetime().optional(),
  reportingManagerId: z.string().optional(),
});

employeeRouter.post("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // doc §41 — checked BEFORE the employee is created: a "check first"
  // trigger point, so REJECT blocks onboarding entirely rather than
  // creating a record and rejecting it after the fact.
  const matched = await matchRules(prisma, req.auth!.institutionId, "EMPLOYEE_ONBOARDING", parsed.data);
  const blockingRule = matched.find((m) => m.hasReject);
  if (blockingRule) {
    return res.status(400).json({ error: `Employee onboarding blocked by business rule ${blockingRule.rule.ruleCode}: ${blockingRule.rule.name}` });
  }

  const { employmentDate, confirmationDate, ...rest } = parsed.data;
  const employee = await prisma.employee.create({
    data: {
      institutionId: req.auth!.institutionId,
      ...rest,
      employmentDate: employmentDate ? new Date(employmentDate) : undefined,
      confirmationDate: confirmationDate ? new Date(confirmationDate) : undefined,
    },
  });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "employee.create", resource: "employee", resourceId: employee.id },
  });
  const ruleWarnings = await executeMatchedRules(prisma, req.auth!.institutionId, req.auth!.userId, "Employee", employee.id, matched);
  res.status(201).json({ employee, ruleWarnings });
});

// CRUAA — Update
const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  branchId: z.string().optional().nullable(),
  employeeNumber: z.string().optional().nullable(),
  employmentType: employmentTypeEnum.optional(),
  departmentId: z.string().optional().nullable(),
  division: z.string().optional().nullable(),
  positionId: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  employmentDate: z.string().datetime().optional().nullable(),
  confirmationDate: z.string().datetime().optional().nullable(),
  reportingManagerId: z.string().optional().nullable(),
});

employeeRouter.patch("/:id", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { expectedVersion, ...body } = req.body as { expectedVersion?: number; [key: string]: any };
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  try {
    await checkVersion(prisma, "employee", existing.id, expectedVersion);
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return res.status(409).json({ error: err.message, currentVersion: err.currentVersion });
    }
    throw err;
  }

  if (parsed.data.reportingManagerId === req.params.id) {
    return res.status(400).json({ error: "An employee cannot be their own reporting manager" });
  }

  const { employmentDate, confirmationDate, ...rest } = parsed.data;
  const employee = await prisma.employee.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(employmentDate !== undefined ? { employmentDate: employmentDate ? new Date(employmentDate) : null } : {}),
      ...(confirmationDate !== undefined ? { confirmationDate: confirmationDate ? new Date(confirmationDate) : null } : {}),
    },
  });
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
