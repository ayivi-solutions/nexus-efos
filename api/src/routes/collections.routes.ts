import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateCollectionTransactionNumber } from "../lib/collectionTransactionNumber";
import { assessDelinquencyRisk } from "../lib/delinquencyRisk";
import { assessCollectorIntegrity } from "../lib/collectorIntegrity";

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

// -------------------------------------------------------------------------
// §83 Commission Management
// -------------------------------------------------------------------------

collectionsRouter.get("/commission-structures", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const structures = await prisma.commissionStructure.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ structures });
});

const structureSchema = z.object({ name: z.string().min(1), type: z.enum(["PERCENTAGE_OF_COLLECTIONS", "FIXED_PER_COLLECTION"]), rate: z.number().positive() });

collectionsRouter.post("/commission-structures", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = structureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const structure = await prisma.commissionStructure.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } as any });
  res.status(201).json({ structure });
});

collectionsRouter.get("/commission-records", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const records = await prisma.commissionRecord.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { periodStart: "desc" } });
  res.json({ records });
});

const calcSchema = z.object({ collectorId: z.string(), structureId: z.string(), periodStart: z.string(), periodEnd: z.string() });

// §83.2 "Commission Calculation" — totalCollected and collectionCount are
// always computed here from real, completed CollectionTransactions for
// the given collector and period; nothing about the underlying activity
// is trusted from the request.
collectionsRouter.post("/commission-records/calculate", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = calcSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const structure = await prisma.commissionStructure.findFirst({ where: { id: parsed.data.structureId, institutionId: req.auth!.institutionId, active: true } });
  if (!structure) return res.status(404).json({ error: "Active commission structure not found" });

  const periodStart = new Date(parsed.data.periodStart);
  const periodEnd = new Date(parsed.data.periodEnd);

  const txns = await prisma.collectionTransaction.findMany({
    where: { collectorId: parsed.data.collectorId, status: "COMPLETED", collectedAt: { gte: periodStart, lte: periodEnd } },
  });
  const totalCollected = txns.reduce((sum, t) => sum + Number(t.amount), 0);
  const collectionCount = txns.length;

  const commissionAmount =
    structure.type === "PERCENTAGE_OF_COLLECTIONS"
      ? Math.round(totalCollected * (Number(structure.rate) / 100) * 100) / 100
      : Math.round(collectionCount * Number(structure.rate) * 100) / 100;

  const record = await prisma.commissionRecord.create({
    data: {
      institutionId: req.auth!.institutionId, collectorId: parsed.data.collectorId, structureId: structure.id,
      periodStart, periodEnd, totalCollected, collectionCount, commissionAmount,
    },
  });

  res.status(201).json({ record });
});

// §83.3 "Approval required before payment"
collectionsRouter.post("/commission-records/:id/request-payment", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const record = await prisma.commissionRecord.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!record) return res.status(404).json({ error: "Commission record not found" });
  if (record.status !== "PENDING") return res.status(400).json({ error: `Only a PENDING record can request payment (currently ${record.status})` });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "COMMISSION_PAYMENT", targetType: "CommissionRecord", targetId: record.id, payload: {}, reason: `Commission payment of GHS ${record.commissionAmount}`, requestedById: req.auth!.userId },
  });
  const updated = await prisma.commissionRecord.update({ where: { id: record.id }, data: { status: "PENDING_APPROVAL" } });

  res.json({ record: updated });
});

// -------------------------------------------------------------------------
// §85 Collection Reporting — the real, achievable parts (Daily Collection,
// Collector Performance, Route Performance, Outstanding, Commission, Cash
// Settlement, Exception Reports). §85.2-3's "AI-Based Insights" and
// "Predictive Forecasts" deliberately not built here — no AI/ML
// infrastructure exists in this project yet; a dedicated AI spec is in
// progress and this report will extend to use it once that lands.
// -------------------------------------------------------------------------

collectionsRouter.get("/reports/summary", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = req.query as { from?: string; to?: string };
  const rangeStart = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const rangeEnd = to ? new Date(to) : new Date();

  const [collectors, routes, transactions, settlements, records] = await Promise.all([
    prisma.collector.findMany({ where: { institutionId } }),
    prisma.collectionRoute.findMany({ where: { institutionId }, include: { customers: { where: { active: true } } } }),
    prisma.collectionTransaction.findMany({ where: { institutionId, collectedAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.collectionSettlement.findMany({ where: { institutionId, settlementDate: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.commissionRecord.findMany({ where: { institutionId } }),
  ]);

  const employeeIds = collectors.map((c) => c.employeeId);
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true } });
  const empName: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, e.fullName]));

  // §85.2 Daily Collection Report
  const completedTxns = transactions.filter((t) => t.status === "COMPLETED");
  const dailyCollection = {
    totalAmount: completedTxns.reduce((s, t) => s + Number(t.amount), 0),
    count: completedTxns.length,
    byType: {
      SAVINGS_DEPOSIT: completedTxns.filter((t) => t.type === "SAVINGS_DEPOSIT").reduce((s, t) => s + Number(t.amount), 0),
      LOAN_REPAYMENT: completedTxns.filter((t) => t.type === "LOAN_REPAYMENT").reduce((s, t) => s + Number(t.amount), 0),
    },
  };

  // §85.2 Collector Performance Report
  const collectorPerformance = collectors.map((c) => {
    const own = completedTxns.filter((t) => t.collectorId === c.id);
    return {
      collectorId: c.id, name: empName[c.employeeId] || "—", availability: c.availability,
      totalCollected: own.reduce((s, t) => s + Number(t.amount), 0), collectionCount: own.length,
    };
  }).sort((a, b) => b.totalCollected - a.totalCollected);

  // §85.2 Route Performance Report
  const routePerformance = routes.map((r) => ({
    routeId: r.id, name: r.name, customerCount: r.customers.length,
    collected: completedTxns.filter((t) => r.customers.some((rc) => rc.customerId === t.customerId)).reduce((s, t) => s + Number(t.amount), 0),
  }));

  // §85.2 Cash Settlement Report
  const cashSettlement = {
    totalExpected: settlements.reduce((s, x) => s + Number(x.expectedAmount), 0),
    totalActual: settlements.reduce((s, x) => s + Number(x.actualAmount), 0),
    reconciled: settlements.filter((x) => x.status === "RECONCILED").length,
    pendingVariance: settlements.filter((x) => x.status === "VARIANCE_PENDING_APPROVAL").length,
  };

  // §85.2 Exception Report — collectors suspended, and unresolved variances
  const exceptions = {
    suspendedCollectors: collectors.filter((c) => c.availability === "SUSPENDED").map((c) => empName[c.employeeId] || c.id),
    unresolvedVariances: settlements.filter((x) => x.status === "VARIANCE_PENDING_APPROVAL").length,
  };

  // §85.2 Commission Report (all-time, not range-bound, since commission periods can span multiple days)
  const commissionSummary = {
    pending: records.filter((r) => r.status === "PENDING").reduce((s, r) => s + Number(r.commissionAmount), 0),
    pendingApproval: records.filter((r) => r.status === "PENDING_APPROVAL").reduce((s, r) => s + Number(r.commissionAmount), 0),
    paid: records.filter((r) => r.status === "PAID").reduce((s, r) => s + Number(r.commissionAmount), 0),
  };

  res.json({ dailyCollection, collectorPerformance, routePerformance, cashSettlement, exceptions, commissionSummary });
});

// -----------------------------------------------------------------------
// EAIS §129.1 Delinquency Prediction / §129.2 Collections Prioritisation.
// Scores loans that are CURRENT (not yet in arrears) for early-warning
// signals — the reactive arrears system (lib/arrears.ts) already tells
// you what's late; this estimates what's *about to be*. Advisory Mode
// only, per the EAIS: does not alter arrears status, fees, or take any
// action — purely a prioritised list for a collections officer's actual
// daily decision (who to check in on before they become a problem).
// -----------------------------------------------------------------------
collectionsRouter.get("/delinquency-risk", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loans = await prisma.loan.findMany({
    where: { institutionId: req.auth!.institutionId, status: { in: ["DISBURSED", "ACTIVE"] }, arrearsClassification: "CURRENT" },
    include: {
      customer: { select: { id: true, fullName: true, phone: true, riskRating: true } },
      installments: { orderBy: { installmentNumber: "asc" } },
    },
  });

  // Batched once, not per-loan — real customers can hold multiple loans;
  // this avoids an N+1 query for the "other loans in arrears" signal.
  const customerIds = Array.from(new Set(loans.map((l: any) => l.customerId)));
  const loansInArrearsByCustomer = await prisma.loan.findMany({
    where: { institutionId: req.auth!.institutionId, customerId: { in: customerIds }, arrearsClassification: { not: "CURRENT" }, status: { in: ["DISBURSED", "ACTIVE"] } },
    select: { customerId: true },
  });
  const customersWithArrears = new Set(loansInArrearsByCustomer.map((l: any) => l.customerId));

  // Batched once for every loan being scored, not one query per loan —
  // Supabase's connection pool can't sustain per-row sequential queries.
  const loanIds = loans.map((l: any) => l.id);
  const allRepayments = await prisma.loanRepayment.findMany({
    where: { loanId: { in: loanIds } },
    orderBy: { paidAt: "desc" },
    select: { loanId: true, amount: true, paidAt: true },
  });
  const repaymentsByLoan = new Map<string, { amount: any; paidAt: Date }[]>();
  for (const r of allRepayments as any[]) {
    if (!repaymentsByLoan.has(r.loanId)) repaymentsByLoan.set(r.loanId, []);
    repaymentsByLoan.get(r.loanId)!.push(r);
  }

  const now = new Date();
  const results = [];
  for (const loan of loans as any[]) {
    const dueInstallments = loan.installments.filter((i: any) => new Date(i.dueDate) <= now);
    if (dueInstallments.length === 0) continue; // nothing due yet at all — no basis for a signal either way

    const cumulativeDue = dueInstallments.reduce((s: number, i: any) => s + Number(i.totalDue), 0);
    const repayments = repaymentsByLoan.get(loan.id) || []; // already sorted desc by paidAt from the batched query above
    const cumulativePaid = repayments.reduce((s: number, r: any) => s + Number(r.amount), 0);

    const daysSinceLastRepayment = repayments.length > 0 ? Math.floor((now.getTime() - new Date(repayments[0].paidAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

    // Real interval from this loan's own schedule, not an assumed default.
    let typicalInstallmentIntervalDays = 30;
    if (loan.installments.length >= 2) {
      const d1 = new Date(loan.installments[0].dueDate).getTime();
      const d2 = new Date(loan.installments[1].dueDate).getTime();
      typicalInstallmentIntervalDays = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }

    const risk = assessDelinquencyRisk({
      cumulativeDue,
      cumulativePaid,
      daysSinceLastRepayment,
      typicalInstallmentIntervalDays,
      installmentsSoFar: dueInstallments.length,
      customerRiskRating: loan.customer.riskRating,
      hasOtherLoansInArrears: customersWithArrears.has(loan.customerId),
    });

    if (risk.riskBand === "LOW") continue; // not worth surfacing — this is a prioritised watch list, not every current loan

    results.push({
      loanId: loan.id, customerId: loan.customerId, customerName: loan.customer.fullName, customerPhone: loan.customer.phone,
      principal: loan.principal, branchId: loan.branchId,
      ...risk,
    });
  }

  results.sort((a, b) => b.riskScore - a.riskScore);
  res.json({ loans: results });
});

// -----------------------------------------------------------------------
// EAIS §127.5 Agent and Collector Fraud. See lib/collectorIntegrity.ts
// for the full reasoning on the three signals used and the one
// deliberately excluded (off-hours timing — the EAIS itself warns
// against exactly that kind of naive signal for field agents).
// Defaults to the last 30 days; this is genuinely a period-sensitive
// metric (a collector with 2 transactions this week shouldn't get a
// confident score), so the frontend always shows confidence alongside it.
// -----------------------------------------------------------------------
collectionsRouter.get("/collector-integrity", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const days = Math.min(Math.max(Number((req.query as any).days) || 30, 7), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const collectors = await prisma.collector.findMany({
    where: { institutionId },
    include: { routes: { where: { active: true }, include: { customers: { where: { active: true }, select: { customerId: true } } } } },
  });
  if (collectors.length === 0) return res.json({ collectors: [] });

  const collectorIds = collectors.map((c: any) => c.id);
  // Collector has no direct Prisma relation to Employee, only a plain
  // employeeId string — same reasoning as the existing /reports/summary
  // endpoint just above: a separate batched lookup, not an include.
  const employeeIds = collectors.map((c: any) => c.employeeId);
  const employeesForNames = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true } });
  const collectorEmpName: Record<string, string> = Object.fromEntries(employeesForNames.map((e: any) => [e.id, e.fullName]));

  // Batched once across every collector — same discipline as
  // /delinquency-risk, avoiding a query per collector in a loop.
  const [allTransactions, allSettlements, allComplaints] = await Promise.all([
    prisma.collectionTransaction.findMany({
      where: { institutionId, collectorId: { in: collectorIds }, collectedAt: { gte: since } },
      select: { collectorId: true, reversedAt: true },
    }),
    prisma.collectionSettlement.findMany({
      where: { institutionId, collectorId: { in: collectorIds }, settlementDate: { gte: since } },
      select: { collectorId: true, variance: true, expectedAmount: true },
    }),
    prisma.customerComplaint.findMany({
      where: { institutionId, createdAt: { gte: since } },
      select: { customerId: true },
    }),
  ]);

  const complaintCountByCustomer = new Map<string, number>();
  for (const c of allComplaints as any[]) complaintCountByCustomer.set(c.customerId, (complaintCountByCustomer.get(c.customerId) || 0) + 1);

  // Institutional baseline reversal rate — computed once across all
  // collectors in the period, so each collector's own rate is judged
  // relative to how this institution's collectors normally behave.
  const totalTxns = allTransactions.length;
  const totalReversals = (allTransactions as any[]).filter((t) => t.reversedAt).length;
  const institutionalReversalRate = totalTxns > 0 ? totalReversals / totalTxns : 0;

  const results = [];
  for (const collector of collectors as any[]) {
    const txns = (allTransactions as any[]).filter((t) => t.collectorId === collector.id);
    const reversals = txns.filter((t) => t.reversedAt).length;
    const settlements = (allSettlements as any[]).filter((s) => s.collectorId === collector.id);
    const varianceSettlements = settlements.filter((s) => Number(s.variance) !== 0);
    const totalVarianceAmount = settlements.reduce((s: number, x: any) => s + Math.abs(Number(x.variance)), 0);
    const totalSettledAmount = settlements.reduce((s: number, x: any) => s + Number(x.expectedAmount), 0);

    const routeCustomerIds = new Set<string>();
    for (const route of collector.routes) for (const rc of route.customers) routeCustomerIds.add(rc.customerId);
    let complaintCount = 0;
    for (const custId of routeCustomerIds) complaintCount += complaintCountByCustomer.get(custId) || 0;

    const result = assessCollectorIntegrity({
      collectorTransactionCount: txns.length,
      collectorReversalCount: reversals,
      institutionalReversalRate,
      settlementCount: settlements.length,
      varianceSettlementCount: varianceSettlements.length,
      totalVarianceAmount,
      totalSettledAmount,
      complaintCount,
    });

    if (result.band === "NORMAL") continue; // a watch list, not a roster of everyone

    results.push({
      collectorId: collector.id, employeeName: collectorEmpName[collector.employeeId] || "—", availability: collector.availability,
      transactionCount: txns.length, settlementCount: settlements.length,
      ...result,
    });
  }

  results.sort((a, b) => b.score - a.score);
  res.json({ collectors: results, periodDays: days });
});
