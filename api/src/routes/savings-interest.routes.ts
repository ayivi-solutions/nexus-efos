import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const savingsInterestRouter = Router();
savingsInterestRouter.use(requireAuth);

// doc §52 Savings Interest Management, full fidelity per all of §52.3/§52.4/§52.5.

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// §52.4 balance-used reconstruction — the most recent transaction's
// balanceAfter at or before the given date. Correct even when accrual
// hasn't been run for a few days, since it derives from the real ledger
// rather than a cached figure.
async function getBalanceAsOf(accountId: string, date: Date): Promise<number> {
  const txn = await prisma.savingsTransaction.findFirst({
    where: { accountId, createdAt: { lte: date } },
    orderBy: { createdAt: "desc" },
  });
  return txn ? Number(txn.balanceAfter) : 0;
}

// §52.4 rate resolution: active account-level Promotional rate first, else
// Tiered lookup by the balance figure actually used for this accrual, else
// the product's Fixed/Variable rate (versioning already gives "variable
// over time" — a new ProductVersion is a new rate, with history preserved).
async function resolveEffectiveRate(account: any, productVersion: any, balanceUsed: number): Promise<number> {
  const now = new Date();
  if (account.promoInterestRate && account.promoExpiresAt && new Date(account.promoExpiresAt) > now) {
    return Number(account.promoInterestRate);
  }
  if (productVersion.interestRateType === "TIERED") {
    const tiers = await prisma.interestRateTier.findMany({
      where: { productVersionId: productVersion.id, deletedAt: null },
      orderBy: { minBalance: "asc" },
    });
    for (const tier of tiers) {
      const min = Number(tier.minBalance);
      const max = tier.maxBalance === null ? null : Number(tier.maxBalance);
      if (balanceUsed >= min && (max === null || balanceUsed <= max)) {
        return Number(tier.interestRate);
      }
    }
  }
  return Number(productVersion.interestRate);
}

async function loadAccountWithProduct(accountId: string, institutionId: string) {
  const account = await prisma.savingsAccount.findFirst({ where: { id: accountId, institutionId } });
  if (!account) return null;
  if (!account.productVersionId) return { account, productVersion: null };
  const productVersion = await prisma.productVersion.findUnique({ where: { id: account.productVersionId } });
  return { account, productVersion };
}

// Runs (or re-runs, if not yet posted — this doubles as §52.3 Interest
// Recalculation) accrual for one account through `throughDate`. DAILY_BALANCE
// produces one row per day; AVERAGE_DAILY_BALANCE/MINIMUM_MONTHLY_BALANCE
// produce one row per calendar month, upserted so re-running mid-period
// updates the same row rather than duplicating it.
async function runAccrualForAccount(accountId: string, institutionId: string, throughDate: Date) {
  const loaded = await loadAccountWithProduct(accountId, institutionId);
  if (!loaded || !loaded.productVersion) return { skipped: "no product configured" };
  const { account, productVersion } = loaded;

  if (account.interestSuspended) return { skipped: "interest suspended" };
  if (account.status !== "ACTIVE") return { skipped: `account status is ${account.status}` };

  const method = productVersion.interestMethod;
  const results: any[] = [];

  if (method === "AVERAGE_DAILY_BALANCE" || method === "MINIMUM_MONTHLY_BALANCE") {
    const periodStart = startOfMonth(throughDate);
    const periodEnd = throughDate < endOfMonth(throughDate) ? throughDate : endOfMonth(throughDate);

    const existing = await prisma.savingsInterestAccrual.findUnique({
      where: { accountId_accrualDate: { accountId, accrualDate: periodStart } },
    });
    if (existing?.posted) return { skipped: "this period is already posted — use reversal to adjust" };

    const dayBalances: number[] = [];
    for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
      dayBalances.push(await getBalanceAsOf(accountId, startOfDay(new Date(d))));
    }
    const balanceUsed =
      method === "AVERAGE_DAILY_BALANCE"
        ? dayBalances.reduce((a, b) => a + b, 0) / dayBalances.length
        : Math.min(...dayBalances);

    const rate = await resolveEffectiveRate(account, productVersion, balanceUsed);
    const amountAccrued = round2(balanceUsed * (rate / 100) * (daysInMonth(throughDate) / 365));

    const accrual = await prisma.savingsInterestAccrual.upsert({
      where: { accountId_accrualDate: { accountId, accrualDate: periodStart } },
      create: {
        institutionId, accountId, accrualDate: periodStart,
        balanceUsed: round2(balanceUsed), rateApplied: rate, method, amountAccrued,
      },
      update: { balanceUsed: round2(balanceUsed), rateApplied: rate, amountAccrued },
    });
    results.push(accrual);
  } else {
    // DAILY_BALANCE (default)
    const fromDate = account.lastAccrualDate ? new Date(account.lastAccrualDate) : startOfDay(throughDate);
    for (let d = startOfDay(fromDate); d <= startOfDay(throughDate); d.setDate(d.getDate() + 1)) {
      const accrualDate = startOfDay(new Date(d));
      const existing = await prisma.savingsInterestAccrual.findUnique({
        where: { accountId_accrualDate: { accountId, accrualDate } },
      });
      if (existing?.posted) continue;

      // Closing balance for the day, not opening — a same-day deposit should
      // earn that day's interest, matching how Daily Balance methods are
      // conventionally applied in practice. accrualDate itself stays at
      // midnight as the dedup key; only the balance lookup uses end-of-day.
      const balanceUsed = await getBalanceAsOf(accountId, endOfDay(accrualDate));
      const rate = await resolveEffectiveRate(account, productVersion, balanceUsed);
      const amountAccrued = round2(balanceUsed * (rate / 100) / 365);

      const accrual = await prisma.savingsInterestAccrual.upsert({
        where: { accountId_accrualDate: { accountId, accrualDate } },
        create: { institutionId, accountId, accrualDate, balanceUsed, rateApplied: rate, method, amountAccrued },
        update: { balanceUsed, rateApplied: rate, amountAccrued },
      });
      results.push(accrual);
    }
  }

  await prisma.savingsAccount.update({ where: { id: account.id }, data: { lastAccrualDate: throughDate } });
  return { accruals: results };
}

const dateQuerySchema = z.object({ date: z.string().optional() });

savingsInterestRouter.post("/:accountId/accrue", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = dateQuerySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const throughDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

  const result = await runAccrualForAccount(req.params.accountId, req.auth!.institutionId, throughDate);

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_accrue", resource: "savings_account", resourceId: req.params.accountId, metadata: result },
  });

  res.json(result);
});

savingsInterestRouter.post("/accrue-all", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = dateQuerySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const throughDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

  const accounts = await prisma.savingsAccount.findMany({
    where: { institutionId: req.auth!.institutionId, status: "ACTIVE", interestSuspended: false },
  });

  let accountsProcessed = 0;
  let accrualRowsCreated = 0;
  for (const acc of accounts) {
    const result = await runAccrualForAccount(acc.id, req.auth!.institutionId, throughDate);
    if (result.accruals) {
      accountsProcessed++;
      accrualRowsCreated += result.accruals.length;
    }
  }

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_accrue_all", resource: "savings_account", resourceId: "batch", metadata: { accountsProcessed, accrualRowsCreated } },
  });

  res.json({ accountsProcessed, accrualRowsCreated });
});

// §52.3 Interest Posting — the balance-affecting, fully-audited step.
async function postInterestForAccount(accountId: string, institutionId: string, postedById: string, batchId?: string) {
  const unposted = await prisma.savingsInterestAccrual.findMany({
    where: { accountId, institutionId, posted: false },
    orderBy: { accrualDate: "asc" },
  });
  if (unposted.length === 0) return null;

  const totalAmount = round2(unposted.reduce((sum, a) => sum + Number(a.amountAccrued), 0));
  if (totalAmount <= 0) return null;

  const account = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: accountId } });
  const newBalance = round2(Number(account.balance) + totalAmount);

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.savingsTransaction.create({
      data: { accountId, type: "INTEREST", amount: totalAmount, balanceAfter: newBalance, recordedById: postedById },
    });
    await tx.savingsAccount.update({ where: { id: accountId }, data: { balance: newBalance, ledgerBalance: newBalance } });

    const posting = await tx.savingsInterestPosting.create({
      data: {
        institutionId, accountId,
        periodStart: unposted[0].accrualDate,
        periodEnd: unposted[unposted.length - 1].accrualDate,
        totalAmount, transactionId: txn.id, batchId, postedById,
      },
    });

    await tx.savingsInterestAccrual.updateMany({
      where: { id: { in: unposted.map((a) => a.id) } },
      data: { posted: true, postingId: posting.id },
    });

    return { posting, transaction: txn };
  });

  return result;
}

savingsInterestRouter.post("/:accountId/post", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const result = await postInterestForAccount(req.params.accountId, req.auth!.institutionId, req.auth!.userId);
  if (!result) return res.status(400).json({ error: "No unposted accrued interest for this account" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_post", resource: "savings_account", resourceId: req.params.accountId, metadata: { amount: result.posting.totalAmount } },
  });

  res.status(201).json(result);
});

// §119 Ledger Posting Management — Batch Posting, a named first-class pattern.
savingsInterestRouter.post("/post-all", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const batchId = crypto.randomUUID();
  const accountsWithUnposted = await prisma.savingsInterestAccrual.findMany({
    where: { institutionId: req.auth!.institutionId, posted: false },
    select: { accountId: true },
    distinct: ["accountId"],
  });

  let accountsPosted = 0;
  let totalPosted = 0;
  for (const { accountId } of accountsWithUnposted) {
    const result = await postInterestForAccount(accountId, req.auth!.institutionId, req.auth!.userId, batchId);
    if (result) {
      accountsPosted++;
      totalPosted = round2(totalPosted + Number(result.posting.totalAmount));
    }
  }

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_post_all", resource: "savings_account", resourceId: "batch", metadata: { batchId, accountsPosted, totalPosted } },
  });

  res.status(201).json({ batchId, accountsPosted, totalPosted });
});

// §52.3 Interest Reversal where authorised — resets the linked accruals
// back to unposted so the interest can be reconsidered, rather than the
// amount simply vanishing.
const reversalSchema = z.object({ reason: z.string().min(1) });

savingsInterestRouter.post("/postings/:id/reverse", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = reversalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const posting = await prisma.savingsInterestPosting.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!posting) return res.status(404).json({ error: "Posting not found" });
  if (posting.reversedAt) return res.status(400).json({ error: "This posting has already been reversed" });

  const account = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: posting.accountId } });
  const newBalance = round2(Number(account.balance) - Number(posting.totalAmount));

  await prisma.$transaction(async (tx) => {
    await tx.savingsTransaction.create({
      data: { accountId: posting.accountId, type: "INTEREST", amount: -Number(posting.totalAmount), balanceAfter: newBalance, recordedById: req.auth!.userId },
    });
    await tx.savingsAccount.update({ where: { id: posting.accountId }, data: { balance: newBalance, ledgerBalance: newBalance } });
    await tx.savingsInterestPosting.update({
      where: { id: posting.id },
      data: { reversedAt: new Date(), reversedById: req.auth!.userId, reversalReason: parsed.data.reason },
    });
    await tx.savingsInterestAccrual.updateMany({
      where: { postingId: posting.id },
      data: { posted: false, postingId: null },
    });
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_reverse", resource: "savings_interest_posting", resourceId: posting.id, metadata: { reason: parsed.data.reason, amount: Number(posting.totalAmount) } },
  });

  res.json({ ok: true });
});

// §52.3 Interest Suspension
const suspendSchema = z.object({ reason: z.string().optional() });

savingsInterestRouter.post("/:accountId/suspend", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.updateMany({
    where: { id: req.params.accountId, institutionId: req.auth!.institutionId },
    data: { interestSuspended: true, interestSuspendedReason: parsed.data.reason, interestSuspendedAt: new Date() },
  });
  if (account.count === 0) return res.status(404).json({ error: "Account not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_suspend", resource: "savings_account", resourceId: req.params.accountId, metadata: { reason: parsed.data.reason } },
  });
  res.json({ ok: true });
});

savingsInterestRouter.post("/:accountId/resume", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const account = await prisma.savingsAccount.updateMany({
    where: { id: req.params.accountId, institutionId: req.auth!.institutionId },
    data: { interestSuspended: false, interestSuspendedReason: null, interestSuspendedAt: null },
  });
  if (account.count === 0) return res.status(404).json({ error: "Account not found" });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "savings.interest_resume", resource: "savings_account", resourceId: req.params.accountId },
  });
  res.json({ ok: true });
});

savingsInterestRouter.get("/:accountId/accruals", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const account = await prisma.savingsAccount.findFirst({ where: { id: req.params.accountId, institutionId: req.auth!.institutionId } });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const accruals = await prisma.savingsInterestAccrual.findMany({
    where: { accountId: req.params.accountId },
    orderBy: { accrualDate: "desc" },
  });
  const postings = await prisma.savingsInterestPosting.findMany({
    where: { accountId: req.params.accountId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ accruals, postings });
});

// §52.3 Interest Reporting
savingsInterestRouter.get("/report", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const dateFilter = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };

  const [accruals, postings] = await Promise.all([
    prisma.savingsInterestAccrual.findMany({
      where: { institutionId: req.auth!.institutionId, ...(from || to ? { accrualDate: dateFilter } : {}) },
    }),
    prisma.savingsInterestPosting.findMany({
      where: { institutionId: req.auth!.institutionId, ...(from || to ? { createdAt: dateFilter } : {}) },
      include: { account: { include: { customer: { select: { fullName: true } } } } },
    }),
  ]);

  const totalAccrued = round2(accruals.reduce((s, a) => s + Number(a.amountAccrued), 0));
  const totalPosted = round2(postings.filter((p) => !p.reversedAt).reduce((s, p) => s + Number(p.totalAmount), 0));
  const totalReversed = round2(postings.filter((p) => p.reversedAt).reduce((s, p) => s + Number(p.totalAmount), 0));

  const byMethod: Record<string, number> = {};
  for (const a of accruals) byMethod[a.method] = round2((byMethod[a.method] || 0) + Number(a.amountAccrued));

  const topAccounts = [...postings]
    .filter((p) => !p.reversedAt)
    .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount))
    .slice(0, 10)
    .map((p) => ({ accountNumber: (p as any).account.accountNumber, customer: (p as any).account.customer.fullName, amount: Number(p.totalAmount), postedAt: p.createdAt }));

  res.json({ totalAccrued, totalPosted, totalReversed, byMethod, topAccounts, postingCount: postings.length });
});
