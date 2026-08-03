import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// doc §78 Collections Management. §79 Collector Management + §80 Route
// Management shipped first — everything else in this module (Daily
// Collection Processing, Reconciliation, Commission) depends on collectors
// and routes existing.
export const collectionsRouter = Router();
collectionsRouter.use(requireAuth);

// -------------------------------------------------------------------------
// §79 Collector Management
// -------------------------------------------------------------------------

collectionsRouter.get("/collectors", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const collectors = await prisma.collector.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { routes: { where: { active: true }, select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  // employeeId only stores the id — join in employee display fields
  const employeeIds = collectors.map((c) => c.employeeId);
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true, branchId: true } });
  const empById: Record<string, any> = Object.fromEntries(employees.map((e) => [e.id, e]));
  res.json({ collectors: collectors.map((c) => ({ ...c, employee: empById[c.employeeId] || null })) });
});

const registerCollectorSchema = z.object({ employeeId: z.string(), branchId: z.string().optional() });

// §79.3 "Every assignment is audited" + registration itself.
collectionsRouter.post("/collectors", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = registerCollectorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, institutionId: req.auth!.institutionId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const existing = await prisma.collector.findUnique({ where: { employeeId: employee.id } });
  if (existing) return res.status(400).json({ error: "This employee is already registered as a collector" });

  const collector = await prisma.collector.create({
    data: { institutionId: req.auth!.institutionId, employeeId: employee.id, branchId: parsed.data.branchId || employee.branchId },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collector.register", resource: "collector", resourceId: collector.id, metadata: { employeeId: employee.id } },
  });

  res.status(201).json({ collector });
});

// §79.2 Collector Transfers (branch reassignment)
collectionsRouter.patch("/collectors/:id/transfer", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { branchId } = req.body as { branchId?: string };
  if (!branchId) return res.status(400).json({ error: "branchId is required" });

  const collector = await prisma.collector.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!collector) return res.status(404).json({ error: "Collector not found" });

  const updated = await prisma.collector.update({ where: { id: collector.id }, data: { branchId } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collector.transfer", resource: "collector", resourceId: collector.id, metadata: { newBranchId: branchId } },
  });

  res.json({ collector: updated });
});

// §79.2 Collector Suspension
collectionsRouter.post("/collectors/:id/suspend", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const collector = await prisma.collector.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!collector) return res.status(404).json({ error: "Collector not found" });

  const updated = await prisma.collector.update({
    where: { id: collector.id },
    data: { availability: "SUSPENDED", suspendedById: req.auth!.userId, suspendedAt: new Date(), suspendedReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collector.suspend", resource: "collector", resourceId: collector.id, metadata: { reason } },
  });

  res.json({ collector: updated });
});

collectionsRouter.post("/collectors/:id/reinstate", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const collector = await prisma.collector.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!collector) return res.status(404).json({ error: "Collector not found" });

  const updated = await prisma.collector.update({
    where: { id: collector.id },
    data: { availability: "AVAILABLE", suspendedById: null, suspendedAt: null, suspendedReason: null },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collector.reinstate", resource: "collector", resourceId: collector.id },
  });

  res.json({ collector: updated });
});

// §79.2 Availability Status (leave/available toggle, separate from suspension)
collectionsRouter.patch("/collectors/:id/availability", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { availability } = req.body as { availability?: "AVAILABLE" | "ON_LEAVE" };
  if (!availability || !["AVAILABLE", "ON_LEAVE"].includes(availability)) return res.status(400).json({ error: "availability must be AVAILABLE or ON_LEAVE" });

  const collector = await prisma.collector.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!collector) return res.status(404).json({ error: "Collector not found" });
  if (collector.availability === "SUSPENDED") return res.status(400).json({ error: "A suspended collector must be reinstated first" });

  const updated = await prisma.collector.update({ where: { id: collector.id }, data: { availability } });
  res.json({ collector: updated });
});

// -------------------------------------------------------------------------
// §80 Collection Route Management
// -------------------------------------------------------------------------

collectionsRouter.get("/routes", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const routes = await prisma.collectionRoute.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { customers: { where: { active: true }, select: { id: true, customerId: true, sequence: true } }, branch: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ routes });
});

const createRouteSchema = z.object({ name: z.string().min(1), branchId: z.string().optional(), collectorId: z.string().optional(), isTemporary: z.boolean().optional() });

collectionsRouter.post("/routes", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = createRouteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const route = await prisma.collectionRoute.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection_route.create", resource: "collection_route", resourceId: route.id },
  });

  res.status(201).json({ route });
});

// §80.2 Route Transfers — reassigning which collector runs a route
collectionsRouter.patch("/routes/:id/collector", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { collectorId } = req.body as { collectorId?: string | null };
  const route = await prisma.collectionRoute.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!route) return res.status(404).json({ error: "Route not found" });

  const updated = await prisma.collectionRoute.update({ where: { id: route.id }, data: { collectorId: collectorId || null } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection_route.reassign_collector", resource: "collection_route", resourceId: route.id, metadata: { collectorId } },
  });

  res.json({ route: updated });
});

// §80.3 "Route conflicts are prevented" — a customer already on an active
// route assignment elsewhere is blocked, not silently double-booked.
const assignCustomerSchema = z.object({ customerId: z.string(), sequence: z.number().int().optional() });

collectionsRouter.post("/routes/:id/customers", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = assignCustomerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const route = await prisma.collectionRoute.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!route) return res.status(404).json({ error: "Route not found" });

  const conflict = await prisma.collectionRouteCustomer.findFirst({ where: { customerId: parsed.data.customerId, active: true } });
  if (conflict) return res.status(400).json({ error: "This customer is already assigned to an active route — remove them from it first" });

  const assignment = await prisma.collectionRouteCustomer.create({ data: { routeId: route.id, customerId: parsed.data.customerId, sequence: parsed.data.sequence } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection_route.customer_assigned", resource: "collection_route", resourceId: route.id, metadata: { customerId: parsed.data.customerId } },
  });

  res.status(201).json({ assignment });
});

// §80.3 "Historical routes remain available" — a status change, never a delete.
collectionsRouter.delete("/routes/:routeId/customers/:assignmentId", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const assignment = await prisma.collectionRouteCustomer.findFirst({ where: { id: req.params.assignmentId, routeId: req.params.routeId } });
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });

  await prisma.collectionRouteCustomer.update({ where: { id: assignment.id }, data: { active: false, removedAt: new Date() } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection_route.customer_removed", resource: "collection_route", resourceId: req.params.routeId, metadata: { customerId: assignment.customerId } },
  });

  res.status(204).send();
});
