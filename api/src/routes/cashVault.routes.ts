import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// doc §111 Cash and Vault Management. §112 Vault Management + §113 Teller
// Management shipped first — everything else in this module (Cash
// Transfers §114, Balancing/Reconciliation §115) depends on both existing.
export const cashVaultRouter = Router();
cashVaultRouter.use(requireAuth);

// -------------------------------------------------------------------------
// §112 Vault Management
// -------------------------------------------------------------------------

cashVaultRouter.get("/vaults", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const vaults = await prisma.vault.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ vaults });
});

const createVaultSchema = z.object({ branchId: z.string(), name: z.string().min(1) });

cashVaultRouter.post("/vaults", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createVaultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const vault = await prisma.vault.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "vault.create", resource: "vault", resourceId: vault.id } });
  res.status(201).json({ vault });
});

// §112.2 Vault Opening — a real operational action (start of business day),
// not just a status flag flipped silently.
cashVaultRouter.post("/vaults/:id/open", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const vault = await prisma.vault.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.status === "OPEN") return res.status(400).json({ error: "Vault is already open" });

  const updated = await prisma.vault.update({ where: { id: vault.id }, data: { status: "OPEN", openedById: req.auth!.userId, openedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "vault.open", resource: "vault", resourceId: vault.id } });
  res.json({ vault: updated });
});

// §115.3 "Balancing is completed before operational close" — checked
// here, not just documented as a policy. A vault cannot close without a
// same-day RECONCILED (or approved, ex-variance) balancing record.
cashVaultRouter.post("/vaults/:id/close", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const vault = await prisma.vault.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.status === "CLOSED") return res.status(400).json({ error: "Vault is already closed" });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysBalancing = await prisma.cashBalancing.findFirst({
    where: { holderType: "VAULT", holderId: vault.id, balancingDate: todayStart, status: "RECONCILED" },
  });
  if (!todaysBalancing) {
    return res.status(400).json({ error: "This vault must be balanced (and any variance approved) for today before it can be closed" });
  }

  const updated = await prisma.vault.update({ where: { id: vault.id }, data: { status: "CLOSED", closedById: req.auth!.userId, closedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "vault.close", resource: "vault", resourceId: vault.id } });
  res.json({ vault: updated });
});

// §112.2 Cash Receipts / Cash Withdrawals — direct cash movement, not
// a customer transaction. A vault must be OPEN to record either.
const cashEntrySchema = z.object({ type: z.enum(["RECEIPT", "WITHDRAWAL"]), amount: z.number().positive(), notes: z.string().optional() });

cashVaultRouter.get("/vaults/:id/ledger", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const entries = await prisma.cashLedgerEntry.findMany({ where: { holderType: "VAULT", holderId: req.params.id }, orderBy: { recordedAt: "desc" } });
  res.json({ entries });
});

cashVaultRouter.post("/vaults/:id/ledger", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = cashEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const vault = await prisma.vault.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (vault.status !== "OPEN") return res.status(400).json({ error: "Vault must be OPEN to record cash movements" });
  if (parsed.data.type === "WITHDRAWAL" && Number(vault.balance) < parsed.data.amount) return res.status(400).json({ error: "Insufficient vault balance" });

  const newBalance = parsed.data.type === "RECEIPT" ? Number(vault.balance) + parsed.data.amount : Number(vault.balance) - parsed.data.amount;

  const [, entry] = await prisma.$transaction([
    prisma.vault.update({ where: { id: vault.id }, data: { balance: newBalance } }),
    prisma.cashLedgerEntry.create({ data: { institutionId: req.auth!.institutionId, holderType: "VAULT", holderId: vault.id, type: parsed.data.type as any, amount: parsed.data.amount, balanceAfter: newBalance, notes: parsed.data.notes, recordedById: req.auth!.userId } }),
  ]);

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "vault.cash_entry", resource: "vault", resourceId: vault.id, metadata: { type: parsed.data.type, amount: parsed.data.amount } } });
  res.status(201).json({ entry });
});

// -------------------------------------------------------------------------
// §113 Teller Management
// -------------------------------------------------------------------------

cashVaultRouter.get("/tellers", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const tellers = await prisma.teller.findMany({ where: { institutionId: req.auth!.institutionId }, include: { vault: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  const employeeIds = tellers.map((t) => t.employeeId);
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true } });
  const empName: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, e.fullName]));
  res.json({ tellers: tellers.map((t) => ({ ...t, employeeName: empName[t.employeeId] || null })) });
});

const registerTellerSchema = z.object({ employeeId: z.string(), vaultId: z.string().optional(), cashLimit: z.number().positive() });

cashVaultRouter.post("/tellers", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const parsed = registerTellerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employee = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, institutionId: req.auth!.institutionId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  const existing = await prisma.teller.findUnique({ where: { employeeId: employee.id } });
  if (existing) return res.status(400).json({ error: "This employee is already registered as a teller" });

  const teller = await prisma.teller.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "teller.register", resource: "teller", resourceId: teller.id } });
  res.status(201).json({ teller });
});

cashVaultRouter.patch("/tellers/:id/limit", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { cashLimit } = req.body as { cashLimit?: number };
  if (!cashLimit || cashLimit <= 0) return res.status(400).json({ error: "cashLimit must be positive" });
  const updated = await prisma.teller.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { cashLimit } });
  if (updated.count === 0) return res.status(404).json({ error: "Teller not found" });
  res.json({ ok: true });
});

cashVaultRouter.post("/tellers/:id/suspend", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  const teller = await prisma.teller.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!teller) return res.status(404).json({ error: "Teller not found" });
  const updated = await prisma.teller.update({ where: { id: teller.id }, data: { status: "SUSPENDED", suspendedById: req.auth!.userId, suspendedAt: new Date(), suspendedReason: reason } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "teller.suspend", resource: "teller", resourceId: teller.id, metadata: { reason } } });
  res.json({ teller: updated });
});

cashVaultRouter.post("/tellers/:id/reinstate", requirePermission("users.administer"), async (req: AuthedRequest, res) => {
  const teller = await prisma.teller.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!teller) return res.status(404).json({ error: "Teller not found" });
  const updated = await prisma.teller.update({ where: { id: teller.id }, data: { status: "ACTIVE", suspendedById: null, suspendedAt: null, suspendedReason: null } });
  res.json({ teller: updated });
});

// -------------------------------------------------------------------------
// §114 Cash Transfer Management
// -------------------------------------------------------------------------

async function getHolderBalance(type: "VAULT" | "TELLER", id: string): Promise<number | null> {
  if (type === "VAULT") {
    const v = await prisma.vault.findUnique({ where: { id } });
    return v ? Number(v.balance) : null;
  }
  const t = await prisma.teller.findUnique({ where: { id } });
  return t ? Number(t.currentHolding) : null;
}

cashVaultRouter.get("/transfers", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const transfers = await prisma.cashTransfer.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ transfers });
});

const transferSchema = z.object({
  fromType: z.enum(["VAULT", "TELLER"]), fromId: z.string(),
  toType: z.enum(["VAULT", "TELLER"]), toId: z.string(),
  amount: z.number().positive(), isEmergency: z.boolean().optional(), reason: z.string().min(2),
});

// §114.3 "Transfers require authorisation" — the source's real current
// balance is checked before the request is even created, so an
// obviously-impossible transfer never enters the approval queue at all.
cashVaultRouter.post("/transfers", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.fromType === parsed.data.toType && parsed.data.fromId === parsed.data.toId) return res.status(400).json({ error: "Source and destination cannot be the same" });

  const sourceBalance = await getHolderBalance(parsed.data.fromType, parsed.data.fromId);
  if (sourceBalance === null) return res.status(404).json({ error: "Source not found" });
  if (sourceBalance < parsed.data.amount) return res.status(400).json({ error: "Insufficient balance at source" });

  const destExists = await getHolderBalance(parsed.data.toType, parsed.data.toId);
  if (destExists === null) return res.status(404).json({ error: "Destination not found" });

  const transfer = await prisma.cashTransfer.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data, requestedById: req.auth!.userId } as any });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "CASH_TRANSFER", targetType: "CashTransfer", targetId: transfer.id, payload: {}, reason: parsed.data.reason, requestedById: req.auth!.userId },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cash_transfer.requested", resource: "cash_transfer", resourceId: transfer.id, metadata: { amount: parsed.data.amount, isEmergency: parsed.data.isEmergency } } });

  res.status(202).json({ pendingApproval: true, transfer });
});

// -------------------------------------------------------------------------
// §115 Cash Balancing and Reconciliation
// -------------------------------------------------------------------------

cashVaultRouter.get("/balancings", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const balancings = await prisma.cashBalancing.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { balancingDate: "desc" } });
  res.json({ balancings });
});

const balancingSchema = z.object({
  holderType: z.enum(["VAULT", "TELLER"]), holderId: z.string(),
  balancingDate: z.string(), countedAmount: z.number().nonnegative(), investigationNotes: z.string().optional(),
});

// §115.2 "Daily Cash Balancing" / "Variance Detection" — expectedAmount is
// always the real current balance/holding at the moment of balancing,
// never trusted from the request; only countedAmount (the physical count)
// is self-reported, since that's the one figure that genuinely needs it.
cashVaultRouter.post("/balancings", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = balancingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const expectedAmount = await getHolderBalance(parsed.data.holderType, parsed.data.holderId);
  if (expectedAmount === null) return res.status(404).json({ error: "Holder not found" });

  const balancingDate = new Date(parsed.data.balancingDate);
  balancingDate.setHours(0, 0, 0, 0);

  const existing = await prisma.cashBalancing.findUnique({ where: { holderType_holderId_balancingDate: { holderType: parsed.data.holderType as any, holderId: parsed.data.holderId, balancingDate } } });
  if (existing) return res.status(400).json({ error: "A balancing record already exists for this holder and date" });

  const variance = Math.round((parsed.data.countedAmount - expectedAmount) * 100) / 100;
  if (Math.abs(variance) >= 0.01 && !parsed.data.investigationNotes) {
    return res.status(400).json({ error: "A variance was detected — investigation notes are required" });
  }

  const balancing = await prisma.cashBalancing.create({
    data: {
      institutionId: req.auth!.institutionId, holderType: parsed.data.holderType as any, holderId: parsed.data.holderId,
      balancingDate, expectedAmount, countedAmount: parsed.data.countedAmount, variance, investigationNotes: parsed.data.investigationNotes,
      status: Math.abs(variance) < 0.01 ? "RECONCILED" : "VARIANCE_PENDING_APPROVAL",
      reconciledById: Math.abs(variance) < 0.01 ? req.auth!.userId : undefined,
      reconciledAt: Math.abs(variance) < 0.01 ? new Date() : undefined,
    },
  });

  if (Math.abs(variance) >= 0.01) {
    await prisma.approvalRequest.create({
      data: { institutionId: req.auth!.institutionId, type: "CASH_BALANCING_VARIANCE", targetType: "CashBalancing", targetId: balancing.id, payload: {}, reason: `Cash balancing variance of GHS ${variance} on ${parsed.data.balancingDate}: ${parsed.data.investigationNotes}`, requestedById: req.auth!.userId },
    });
  }

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cash_balancing.recorded", resource: "cash_balancing", resourceId: balancing.id, metadata: { expectedAmount, countedAmount: parsed.data.countedAmount, variance } },
  });

  res.status(201).json({ balancing });
});
