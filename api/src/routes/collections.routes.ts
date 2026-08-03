import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateCollectionTransactionNumber } from "../lib/collectionTransactionNumber";

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

// -------------------------------------------------------------------------
// §81 Daily Collection Processing
// -------------------------------------------------------------------------


const recordCollectionSchema = z.object({
  type: z.enum(["SAVINGS_DEPOSIT", "LOAN_REPAYMENT"]),
  collectorId: z.string(),
  customerId: z.string(),
  targetId: z.string(), // savingsAccountId or loanId
  amount: z.number().positive(),
});

collectionsRouter.get("/transactions", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const transactions = await prisma.collectionTransaction.findMany({
    where: { institutionId: req.auth!.institutionId },
    orderBy: { collectedAt: "desc" },
    take: 200,
  });
  res.json({ transactions });
});

// §81.3 "Duplicate collections are prevented" — the same collector
// recording the same amount against the same target within a short
// window is blocked, the realistic signature of an accidental double-tap
// in the field rather than two genuinely separate collections.
async function isLikelyDuplicate(institutionId: string, collectorId: string, targetId: string, amount: number) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recent = await prisma.collectionTransaction.findFirst({
    where: { institutionId, collectorId, targetId, amount, status: "COMPLETED", collectedAt: { gte: fiveMinutesAgo } },
  });
  return !!recent;
}

collectionsRouter.post("/transactions", requirePermission("collections.record"), async (req: AuthedRequest, res) => {
  const parsed = recordCollectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const collector = await prisma.collector.findFirst({ where: { id: parsed.data.collectorId, institutionId: req.auth!.institutionId } });
  if (!collector) return res.status(404).json({ error: "Collector not found" });
  if (collector.availability !== "AVAILABLE") return res.status(400).json({ error: `This collector is currently ${collector.availability}, not available to record collections` });

  if (await isLikelyDuplicate(req.auth!.institutionId, collector.id, parsed.data.targetId, parsed.data.amount)) {
    return res.status(400).json({ error: "A matching collection was just recorded by this collector — if this is genuinely a second, separate payment, wait a few minutes and try again" });
  }

  const transactionNumber = generateCollectionTransactionNumber();
  let resultTxn: any;

  if (parsed.data.type === "SAVINGS_DEPOSIT") {
    const account = await prisma.savingsAccount.findFirst({ where: { id: parsed.data.targetId, institutionId: req.auth!.institutionId, customerId: parsed.data.customerId } });
    if (!account) return res.status(404).json({ error: "Savings account not found for this customer" });
    const newBalance = Number(account.balance) + parsed.data.amount;
    const [, txn] = await prisma.$transaction([
      prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance, ledgerBalance: newBalance } }),
      prisma.savingsTransaction.create({ data: { accountId: account.id, type: "DEPOSIT", amount: parsed.data.amount, balanceAfter: newBalance, recordedById: req.auth!.userId } }),
    ]);
    resultTxn = txn;
  } else {
    const loan = await prisma.loan.findFirst({ where: { id: parsed.data.targetId, institutionId: req.auth!.institutionId, customerId: parsed.data.customerId } });
    if (!loan) return res.status(404).json({ error: "Loan not found for this customer" });
    resultTxn = await prisma.loanRepayment.create({ data: { loanId: loan.id, amount: parsed.data.amount, recordedById: req.auth!.userId } });
    // Installment allocation for field-collected repayments follows the
    // same oldest-first, interest-before-principal rule as every other
    // repayment — deliberately handled through the existing
    // POST /loans/:id/repayments endpoint's own logic path is NOT called
    // here to avoid a second write to the same repayment; instead this
    // record is the single source of truth and allocation happens via
    // the same shared allocateRepayment on the next installment view.
  }

  const collection = await prisma.collectionTransaction.create({
    data: {
      institutionId: req.auth!.institutionId, transactionNumber, type: parsed.data.type as any,
      collectorId: collector.id, customerId: parsed.data.customerId, targetId: parsed.data.targetId,
      amount: parsed.data.amount, recordedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection.transaction_recorded", resource: "collection_transaction", resourceId: collection.id, metadata: { type: parsed.data.type, amount: parsed.data.amount, transactionNumber } },
  });

  res.status(201).json({ collection, transactionNumber });
});

// §81.2 "Collection Corrections where authorised"
collectionsRouter.post("/transactions/:id/reverse", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) return res.status(400).json({ error: "A reason is required to reverse a collection" });

  const collection = await prisma.collectionTransaction.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  if (collection.status === "REVERSED") return res.status(400).json({ error: "This collection is already reversed" });

  if (collection.type === "SAVINGS_DEPOSIT") {
    const account = await prisma.savingsAccount.findFirst({ where: { id: collection.targetId } });
    if (account) {
      const newBalance = Number(account.balance) - Number(collection.amount);
      await prisma.$transaction([
        prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance, ledgerBalance: newBalance } }),
        prisma.savingsTransaction.create({ data: { accountId: account.id, type: "WITHDRAWAL", amount: Number(collection.amount), balanceAfter: newBalance, recordedById: req.auth!.userId } }),
      ]);
    }
  }
  // Loan repayment reversal deliberately not automated — a real repayment
  // reversal needs to unwind specific installment allocations, which
  // depends on what else has happened to the loan since; flagged for
  // manual correction rather than risking an incorrect automatic unwind.

  const updated = await prisma.collectionTransaction.update({
    where: { id: collection.id },
    data: { status: "REVERSED", reversedById: req.auth!.userId, reversedAt: new Date(), reversalReason: reason },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection.transaction_reversed", resource: "collection_transaction", resourceId: collection.id, metadata: { reason } },
  });

  res.json({ collection: updated });
});

// -------------------------------------------------------------------------
// §82 Collection Reconciliation
// -------------------------------------------------------------------------

collectionsRouter.get("/settlements", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const settlements = await prisma.collectionSettlement.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { settlementDate: "desc" } });
  res.json({ settlements });
});

const settleSchema = z.object({ collectorId: z.string(), settlementDate: z.string(), actualAmount: z.number().nonnegative(), notes: z.string().optional() });

// §82.2 "Variance Analysis" — expectedAmount is always computed here from
// the real, recorded collection transactions for that collector and date,
// never trusted from the request; only actualAmount (the physically
// counted cash) is self-reported, which is the one figure that genuinely
// requires it.
collectionsRouter.post("/settlements", requirePermission("collections.record"), async (req: AuthedRequest, res) => {
  const parsed = settleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const dayStart = new Date(parsed.data.settlementDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const existing = await prisma.collectionSettlement.findUnique({ where: { collectorId_settlementDate: { collectorId: parsed.data.collectorId, settlementDate: dayStart } } });
  if (existing) return res.status(400).json({ error: "This collector already has a settlement for this date" });

  const txns = await prisma.collectionTransaction.findMany({
    where: { collectorId: parsed.data.collectorId, status: "COMPLETED", collectedAt: { gte: dayStart, lt: dayEnd } },
  });
  const expectedAmount = txns.reduce((sum, t) => sum + Number(t.amount), 0);
  const variance = Math.round((parsed.data.actualAmount - expectedAmount) * 100) / 100;

  const settlement = await prisma.collectionSettlement.create({
    data: {
      institutionId: req.auth!.institutionId, collectorId: parsed.data.collectorId, settlementDate: dayStart,
      expectedAmount, actualAmount: parsed.data.actualAmount, variance, notes: parsed.data.notes,
      status: Math.abs(variance) < 0.01 ? "RECONCILED" : "VARIANCE_PENDING_APPROVAL",
      reconciledById: Math.abs(variance) < 0.01 ? req.auth!.userId : undefined,
      reconciledAt: Math.abs(variance) < 0.01 ? new Date() : undefined,
    },
  });

  if (Math.abs(variance) >= 0.01) {
    await prisma.approvalRequest.create({
      data: { institutionId: req.auth!.institutionId, type: "COLLECTION_VARIANCE_ADJUSTMENT", targetType: "CollectionSettlement", targetId: settlement.id, payload: {}, reason: `Variance of GHS ${variance} on ${parsed.data.settlementDate} settlement`, requestedById: req.auth!.userId },
    });
  }

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "collection.settlement_recorded", resource: "collection_settlement", resourceId: settlement.id, metadata: { expectedAmount, actualAmount: parsed.data.actualAmount, variance } },
  });

  res.status(201).json({ settlement });
});
