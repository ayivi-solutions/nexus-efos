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
