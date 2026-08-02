import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// doc §50 Master Data Management — Department/Position as real, normalized
// lookup tables rather than free-text on Employee.
export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

departmentsRouter.get("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const departments = await prisma.department.findMany({
    where: { institutionId: req.auth!.institutionId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  res.json({ departments });
});

const deptSchema = z.object({ name: z.string().min(1), code: z.string().optional() });

departmentsRouter.post("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = deptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const department = await prisma.department.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  res.status(201).json({ department });
});

departmentsRouter.delete("/:id", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const inUse = await prisma.employee.count({ where: { departmentId: req.params.id } });
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete — ${inUse} employee(s) still assigned to this department` });
  await prisma.department.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

export const positionsRouter = Router();
positionsRouter.use(requireAuth);

positionsRouter.get("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const positions = await prisma.position.findMany({
    where: { institutionId: req.auth!.institutionId, deletedAt: null },
    include: { department: true },
    orderBy: { title: "asc" },
  });
  res.json({ positions });
});

const posSchema = z.object({ title: z.string().min(1), departmentId: z.string().optional() });

positionsRouter.post("/", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = posSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const position = await prisma.position.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  res.status(201).json({ position });
});

positionsRouter.delete("/:id", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const inUse = await prisma.employee.count({ where: { positionId: req.params.id } });
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete — ${inUse} employee(s) still assigned to this position` });
  await prisma.position.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
