import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const roleRouter = Router();
roleRouter.use(requireAuth);

roleRouter.get("/", async (req: AuthedRequest, res) => {
  const roles = await prisma.role.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { rolePermissions: { include: { permission: true } } },
  });
  res.json({ roles });
});

roleRouter.get("/permissions", async (_req, res) => {
  const permissions = await prisma.permission.findMany();
  res.json({ permissions });
});

// CRUAA — Create. Custom institution-defined roles alongside the seeded
// system templates.
const createRoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.enum(["EXECUTIVE", "OPERATIONAL", "GOVERNANCE", "TECHNICAL", "CUSTOMER"]),
  permissionCodes: z.array(z.string()).optional(),
});

roleRouter.post("/", requirePermission("roles.configure"), async (req: AuthedRequest, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const role = await prisma.role.create({
    data: {
      institutionId: req.auth!.institutionId,
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      isSystem: false,
    },
  });

  if (parsed.data.permissionCodes?.length) {
    const permissions = await prisma.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "role.create", resource: "role", resourceId: role.id },
  });

  const created = await prisma.role.findUnique({ where: { id: role.id }, include: { rolePermissions: { include: { permission: true } } } });
  res.status(201).json({ role: created });
});

// doc §38.12 — Temporary Delegation: assign a role with optional expiry + branch scope
const assignSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  branchId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  isDelegated: z.boolean().optional(),
});

roleRouter.post("/assign", requirePermission("roles.assign"), async (req: AuthedRequest, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, roleId, branchId, expiresAt, isDelegated } = parsed.data;

  const assignment = await prisma.userRole.create({
    data: {
      userId,
      roleId,
      branchId,
      isDelegated: !!isDelegated,
      delegatedFromUserId: isDelegated ? req.auth!.userId : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "role.assign",
      resource: "user_role",
      resourceId: assignment.id,
      metadata: { targetUserId: userId, roleId, expiresAt: expiresAt || null },
    },
  });

  res.status(201).json({ assignment });
});

roleRouter.delete("/assign/:userRoleId", requirePermission("roles.assign"), async (req: AuthedRequest, res) => {
  await prisma.userRole.delete({ where: { id: req.params.userRoleId } });
  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "role.revoke",
      resource: "user_role",
      resourceId: req.params.userRoleId,
    },
  });
  res.status(204).send();
});

// CRUAA — Update. Replaces the role's permission set atomically. System
// (seeded) role templates can still be edited per-institution — this
// customises the institution's own copy, not the global template.
const updateRoleSchema = z.object({
  description: z.string().optional(),
  permissionCodes: z.array(z.string()).optional(),
});

roleRouter.patch("/:id", requirePermission("roles.configure"), async (req: AuthedRequest, res) => {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const role = await prisma.role.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!role) return res.status(404).json({ error: "Role not found" });

  await prisma.$transaction(async (tx) => {
    if (parsed.data.description !== undefined) {
      await tx.role.update({ where: { id: role.id }, data: { description: parsed.data.description } });
    }
    if (parsed.data.permissionCodes) {
      const permissions = await tx.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "role.update",
      resource: "role",
      resourceId: role.id,
      metadata: { permissionCodes: parsed.data.permissionCodes || null },
    },
  });

  const updated = await prisma.role.findUnique({ where: { id: role.id }, include: { rolePermissions: { include: { permission: true } } } });
  res.json({ role: updated });
});
