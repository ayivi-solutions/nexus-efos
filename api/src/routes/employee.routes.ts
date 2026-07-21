import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const employeeRouter = Router();
employeeRouter.use(requireAuth);

// doc §50.5 Master Data Domains — "Employee Master: Employees, Contract
// staff, Consultants, Field officers, Executives, System users." System
// access (User) is subordinate to the employee record, not the reverse.
employeeRouter.get("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const employees = await prisma.employee.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: {
      branch: true,
      user: { include: { userRoles: { include: { role: true, branch: true } } } },
    },
    orderBy: { fullName: "asc" },
  });
  res.json({ employees });
});

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  branchId: z.string().optional(),
});

employeeRouter.post("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await prisma.employee.create({
    data: { institutionId: req.auth!.institutionId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "employee.create",
      resource: "employee",
      resourceId: employee.id,
    },
  });

  res.status(201).json({ employee });
});

const grantAccessSchema = z.object({ roleId: z.string(), branchId: z.string().optional() });

employeeRouter.post("/:id/grant-access", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = grantAccessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await prisma.employee.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (employee.userId) return res.status(409).json({ error: "This employee already has system access" });

  const user = await prisma.user.create({
    data: {
      institutionId: req.auth!.institutionId,
      fullName: employee.fullName,
      email: employee.email,
      passwordHash: "", // set on invite acceptance
      status: "INVITED",
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: parsed.data.roleId, branchId: parsed.data.branchId },
  });
  await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "employee.grant_access",
      resource: "employee",
      resourceId: employee.id,
    },
  });

  res.status(201).json({ user });
});
