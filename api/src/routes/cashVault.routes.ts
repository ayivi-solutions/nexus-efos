import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { isBalanced, balanceEffect, findPostablePeriod, generateJournalNumber } from "../lib/generalLedger";

// doc §111 Cash and Vault Management. §112 Vault Management + §113 Teller
// Management shipped first — everything else in this module (Cash
// Transfers §114, Balancing/Reconciliation §115) depends on both existing.
export const cashVaultRouter = Router();
cashVaultRouter.use(requireAuth);

// -----------------------------------------------------------------------
// GAP-GL-001 — configuration for the real GL accounts a vault cash
// movement debits/credits. Same shape and pattern as Loan/Savings GL
// mapping endpoints. "gl-mappings" is a top-level segment here (not
// nested under /vaults/:id), so there's no route-ordering risk the way
// there was for Loans/Savings' single-segment paths under a bare /:id.
// -----------------------------------------------------------------------
const ALL_CASH_VAULT_GL_PURPOSES = ["Vault Cash", "Bank Account (External)"];

cashVaultRouter.get("/gl-mappings", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const mappings = await prisma.cashVaultGLAccountMapping.findMany({ where: { institutionId: req.auth!.institutionId } });
  const glAccounts = await prisma.gLAccount.findMany({ where: { institutionId: req.auth!.institutionId, status: "ACTIVE" }, select: { id: true, code: true, name: true } });
  const accountById = new Map(glAccounts.map((a: any) => [a.id, a]));
  res.json({ mappings: mappings.map((m: any) => ({ ...m, account: accountById.get(m.glAccountId) || null })), purposes: ALL_CASH_VAULT_GL_PURPOSES, accounts: glAccounts });
});

cashVaultRouter.post("/gl-mappings", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { purpose, glAccountId } = req.body as { purpose?: string; glAccountId?: string };
  if (!purpose || !glAccountId) return res.status(400).json({ error: "purpose and glAccountId are required" });

  const account = await prisma.gLAccount.findFirst({ where: { id: glAccountId, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "GL account not found" });

  const mapping = await prisma.cashVaultGLAccountMapping.upsert({
    where: { institutionId_purpose: { institutionId: req.auth!.institutionId, purpose } },
    create: { institutionId: req.auth!.institutionId, purpose, glAccountId },
    update: { glAccountId },
  });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "cash_vault_gl_mapping.set", resource: "cash_vault_gl_account_mapping", resourceId: mapping.id, metadata: { purpose, glAccountId } } });
  res.status(201).json({ mapping });
});

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

  // GAP-GL-001 fix, second slice — Cash & Vault. This is a genuine
  // external-boundary transaction: cash physically crossing between the
  // institution's own bank account and vault custody (a bank withdrawal
  // brought to the vault = RECEIPT; cash sent to the bank = WITHDRAWAL).
  // Hard-blocks if unconfigured, same reasoning as Loans/Savings — no
  // real cash movement without a real accounting effect bound to it.
  const mappings = await prisma.cashVaultGLAccountMapping.findMany({ where: { institutionId: req.auth!.institutionId } });
  const accountIdByPurpose: Record<string, string> = Object.fromEntries(mappings.map((m: any) => [m.purpose, m.glAccountId]));
  const vaultCashAccountId = accountIdByPurpose["Vault Cash"];
  const bankAccountId = accountIdByPurpose["Bank Account (External)"];
  if (!vaultCashAccountId || !bankAccountId) {
    return res.status(400).json({ error: "Cash & Vault GL account mapping is not configured (\"Vault Cash\" and \"Bank Account (External)\" both required) — configure this before recording vault cash movements, real cash cannot move without a real accounting effect." });
  }

  const postingDate = new Date();
  const glPeriod = await findPostablePeriod(prisma, req.auth!.institutionId, postingDate);
  if (!glPeriod || glPeriod.status !== "OPEN") {
    return res.status(400).json({ error: glPeriod ? `The financial period covering today is ${glPeriod.status}, not open` : "No financial period covers today's date" });
  }

  const [vaultCashAccount, bankAccount] = await Promise.all([
    prisma.gLAccount.findUniqueOrThrow({ where: { id: vaultCashAccountId } }),
    prisma.gLAccount.findUniqueOrThrow({ where: { id: bankAccountId } }),
  ]);
  const amount = parsed.data.amount;
  // RECEIPT: cash arrives at the vault from the bank — Debit Vault Cash,
  // Credit Bank Account. WITHDRAWAL: cash leaves the vault for the bank
  // — reversed.
  const journalLines = parsed.data.type === "RECEIPT"
    ? [
        { accountId: vaultCashAccountId, category: vaultCashAccount.category, debit: amount, credit: 0 },
        { accountId: bankAccountId, category: bankAccount.category, debit: 0, credit: amount },
      ]
    : [
        { accountId: bankAccountId, category: bankAccount.category, debit: amount, credit: 0 },
        { accountId: vaultCashAccountId, category: vaultCashAccount.category, debit: 0, credit: amount },
      ];
  if (!isBalanced(journalLines)) {
    return res.status(400).json({ error: "Cash movement journal would not balance — check the amount" });
  }

  // GAP-FIN-001-class fix, applied here too: the previous version read
  // vault.balance outside any lock, computed an absolute new value in
  // JS, then wrote it via a non-atomic prisma.$transaction([...]) array
  // — the exact same race as the savings bug fixed earlier today. Two
  // concurrent WITHDRAWAL entries could both read the same starting
  // balance and one would silently overwrite the other's effect, or a
  // WITHDRAWAL could succeed against a balance check that was already
  // stale by the time the write happened. Same atomic guarded pattern
  // now: the sufficient-funds check lives in the same statement as the
  // decrement itself for WITHDRAWAL.
  let entry;
  try {
    [, entry] = await prisma.$transaction(async (tx: any) => {
      let updatedVault;
      if (parsed.data.type === "WITHDRAWAL") {
        const guarded = await tx.vault.updateMany({
          where: { id: vault.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (guarded.count === 0) {
          throw Object.assign(new Error("Insufficient vault balance"), { httpStatus: 400 });
        }
        updatedVault = await tx.vault.findUniqueOrThrow({ where: { id: vault.id } });
      } else {
        updatedVault = await tx.vault.update({ where: { id: vault.id }, data: { balance: { increment: amount } } });
      }

      const e = await tx.cashLedgerEntry.create({
        data: { institutionId: req.auth!.institutionId, holderType: "VAULT", holderId: vault.id, type: parsed.data.type as any, amount, balanceAfter: updatedVault.balance, notes: parsed.data.notes, recordedById: req.auth!.userId },
      });

      const journal = await tx.journal.create({
        data: {
          institutionId: req.auth!.institutionId, journalNumber: generateJournalNumber(), type: "AUTOMATIC",
          description: `Vault ${parsed.data.type.toLowerCase()} — ${vault.name}`, status: "POSTED", postingDate, postedAt: new Date(), postedById: req.auth!.userId, createdById: req.auth!.userId,
          lines: { create: journalLines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) },
        },
      });
      for (const line of journalLines) {
        const effect = balanceEffect(line.category as any, line.debit, line.credit);
        await tx.gLAccount.update({ where: { id: line.accountId }, data: { balance: { increment: effect } } });
      }

      return [updatedVault, e];
    });
  } catch (err: any) {
    if (err.httpStatus === 400) return res.status(400).json({ error: err.message });
    throw err;
  }

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "vault.cash_entry", resource: "vault", resourceId: vault.id, metadata: { type: parsed.data.type, amount } } });
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
