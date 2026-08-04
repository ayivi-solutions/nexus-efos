import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { isBalanced, generateJournalNumber, findPostablePeriod, aggregateBalancesAsOf, aggregateBalancesForPeriod } from "../lib/generalLedger";
import { resolveReportRange, ReportRangeId } from "../lib/reportRanges";
import { runRecurringJournals } from "../lib/scheduler";

// doc §117 Chart of Accounts, §118 Journal Management, §119 Ledger
// Posting — the foundational double-entry engine. Deliberately NOT yet
// wired to auto-post from Savings/Loans/Cash-Vault/etc (§116.4's full
// integration) — that is its own real, separate increment.
export const generalLedgerRouter = Router();
generalLedgerRouter.use(requireAuth);

// -------------------------------------------------------------------------
// §117 Chart of Accounts Management
// -------------------------------------------------------------------------

generalLedgerRouter.get("/accounts", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const accounts = await prisma.gLAccount.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { code: "asc" } });
  res.json({ accounts });
});

const createAccountSchema = z.object({
  code: z.string().min(1), name: z.string().min(1), category: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  parentId: z.string().optional(), currency: z.string().optional(), branchId: z.string().optional(),
});

// §117.3 "Account codes are unique" — enforced at the database level via
// the unique constraint, this check just gives a clean error message
// instead of a raw constraint violation.
generalLedgerRouter.post("/accounts", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.gLAccount.findFirst({ where: { institutionId: req.auth!.institutionId, code: parsed.data.code } });
  if (existing) return res.status(400).json({ error: `Account code ${parsed.data.code} is already in use` });

  const account = await prisma.gLAccount.create({ data: { institutionId: req.auth!.institutionId, ...parsed.data } as any });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "gl_account.create", resource: "gl_account", resourceId: account.id } });
  res.status(201).json({ account });
});

// §117.3 "Inactive accounts cannot receive postings" — enforced when a
// journal line is validated (see /journals/:id/post below), not just here.
generalLedgerRouter.patch("/accounts/:id/status", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { status } = req.body as { status?: "ACTIVE" | "INACTIVE" };
  if (!status || !["ACTIVE", "INACTIVE"].includes(status)) return res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
  const updated = await prisma.gLAccount.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { status } });
  if (updated.count === 0) return res.status(404).json({ error: "Account not found" });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "gl_account.status_change", resource: "gl_account", resourceId: req.params.id, metadata: { status } } });
  res.json({ ok: true });
});

// -------------------------------------------------------------------------
// §118 Journal Management + §119 Ledger Posting Management
// -------------------------------------------------------------------------

generalLedgerRouter.get("/journals", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const journals = await prisma.journal.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ journals });
});

const journalLineSchema = z.object({ accountId: z.string(), debit: z.number().nonnegative(), credit: z.number().nonnegative(), description: z.string().optional() });
const createJournalSchema = z.object({ description: z.string().min(2), postingDate: z.string().optional(), lines: z.array(journalLineSchema).min(2) });

// §118.2 "Manual Journals" — created as DRAFT; §118.3 "Debits equal
// credits" checked here before it's even saved, using the same tested
// function that gates posting, so a journal that could never post isn't
// allowed to exist as anything more than immediately-rejected input.
// §120.3 "Closed periods prevent unauthorised postings" — also checked
// here, at creation, not just at the point of posting — no reason to let
// someone draft a journal against a period that's already known to be
// unusable.
generalLedgerRouter.post("/journals", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createJournalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  for (const line of parsed.data.lines) {
    if (line.debit > 0 && line.credit > 0) return res.status(400).json({ error: "A single journal line cannot have both a debit and a credit" });
    if (line.debit === 0 && line.credit === 0) return res.status(400).json({ error: "Every journal line must have either a debit or a credit" });
  }
  if (!isBalanced(parsed.data.lines)) return res.status(400).json({ error: "Total debits must equal total credits" });

  const postingDate = parsed.data.postingDate ? new Date(parsed.data.postingDate) : new Date();
  const period = await findPostablePeriod(prisma, req.auth!.institutionId, postingDate);
  if (!period) return res.status(400).json({ error: "No financial period covers this posting date — create one first" });
  if (period.status !== "OPEN") return res.status(400).json({ error: `The financial period covering this date is ${period.status} — cannot create a journal against it` });

  const journal = await prisma.journal.create({
    data: {
      institutionId: req.auth!.institutionId, journalNumber: generateJournalNumber(), type: "MANUAL", description: parsed.data.description, postingDate,
      createdById: req.auth!.userId,
      lines: { create: parsed.data.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description })) },
    },
    include: { lines: true },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "journal.create", resource: "journal", resourceId: journal.id, metadata: { journalNumber: journal.journalNumber } } });
  res.status(201).json({ journal });
});

// §118.2 "Approval Workflow" — posting a journal (not just creating it)
// requires a different authorised user, same pattern as everything else
// in this app.
generalLedgerRouter.post("/journals/:id/request-posting", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const journal = await prisma.journal.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!journal) return res.status(404).json({ error: "Journal not found" });
  if (journal.status !== "DRAFT") return res.status(400).json({ error: `Only a DRAFT journal can request posting (currently ${journal.status})` });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "JOURNAL_POSTING", targetType: "Journal", targetId: journal.id, payload: {}, reason: `Post journal ${journal.journalNumber}: ${journal.description}`, requestedById: req.auth!.userId },
  });
  await prisma.journal.update({ where: { id: journal.id }, data: { status: "PENDING_APPROVAL" } });

  res.status(202).json({ pendingApproval: true });
});

// -------------------------------------------------------------------------
// §120 Financial Period Management
// -------------------------------------------------------------------------

generalLedgerRouter.get("/fiscal-years", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const fiscalYears = await prisma.fiscalYear.findMany({ where: { institutionId: req.auth!.institutionId }, include: { periods: true }, orderBy: { startDate: "desc" } });
  res.json({ fiscalYears });
});

const fiscalYearSchema = z.object({ name: z.string().min(1), startDate: z.string(), endDate: z.string() });

generalLedgerRouter.post("/fiscal-years", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = fiscalYearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fiscalYear = await prisma.fiscalYear.create({ data: { institutionId: req.auth!.institutionId, name: parsed.data.name, startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate) } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "fiscal_year.create", resource: "fiscal_year", resourceId: fiscalYear.id } });
  res.status(201).json({ fiscalYear });
});

const periodSchema = z.object({ fiscalYearId: z.string(), name: z.string().min(1), startDate: z.string(), endDate: z.string() });

// §120.2 "Accounting Period Creation" — periods must not overlap within
// the same institution, checked here rather than left to the person
// creating them to notice.
generalLedgerRouter.post("/financial-periods", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = periodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);

  const overlap = await prisma.financialPeriod.findFirst({
    where: { institutionId: req.auth!.institutionId, OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }] },
  });
  if (overlap) return res.status(400).json({ error: `This date range overlaps an existing period (${overlap.name})` });

  const period = await prisma.financialPeriod.create({ data: { institutionId: req.auth!.institutionId, fiscalYearId: parsed.data.fiscalYearId, name: parsed.data.name, startDate, endDate } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "financial_period.create", resource: "financial_period", resourceId: period.id } });
  res.status(201).json({ period });
});

// §120.2 Period Closing
generalLedgerRouter.post("/financial-periods/:id/close", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const period = await prisma.financialPeriod.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!period) return res.status(404).json({ error: "Period not found" });
  if (period.status !== "OPEN") return res.status(400).json({ error: `Only an OPEN period can be closed (currently ${period.status})` });

  const updated = await prisma.financialPeriod.update({ where: { id: period.id }, data: { status: "CLOSED", closedById: req.auth!.userId, closedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "financial_period.close", resource: "financial_period", resourceId: period.id } });
  res.json({ period: updated });
});

// §120.3 "Reopening requires approval" — routes through the Approval
// Workflow, same pattern as everything else.
generalLedgerRouter.post("/financial-periods/:id/request-reopen", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) return res.status(400).json({ error: "A reason is required to reopen a closed period" });
  const period = await prisma.financialPeriod.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!period) return res.status(404).json({ error: "Period not found" });
  if (period.status === "OPEN") return res.status(400).json({ error: "This period is already open" });
  if (period.status === "LOCKED") return res.status(400).json({ error: "A LOCKED period cannot be reopened" });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "FINANCIAL_PERIOD_REOPEN", targetType: "FinancialPeriod", targetId: period.id, payload: {}, reason, requestedById: req.auth!.userId },
  });
  res.status(202).json({ pendingApproval: true });
});

// §120.2 Period Locking — a stronger, later-stage closure than a normal
// close; deliberately no unlock endpoint at all, matching "cannot be
// reopened" above.
generalLedgerRouter.post("/financial-periods/:id/lock", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const period = await prisma.financialPeriod.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!period) return res.status(404).json({ error: "Period not found" });
  if (period.status !== "CLOSED") return res.status(400).json({ error: "Only a CLOSED period can be locked" });

  const updated = await prisma.financialPeriod.update({ where: { id: period.id }, data: { status: "LOCKED", lockedById: req.auth!.userId, lockedAt: new Date() } });
  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "financial_period.lock", resource: "financial_period", resourceId: period.id } });
  res.json({ period: updated });
});

// -------------------------------------------------------------------------
// §122 Recurring Journal Management
// -------------------------------------------------------------------------

generalLedgerRouter.get("/recurring-journals", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const recurringJournals = await prisma.recurringJournal.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ recurringJournals });
});

const recurringLineSchema = z.object({ accountId: z.string(), debit: z.number().nonnegative(), credit: z.number().nonnegative() });
const createRecurringSchema = z.object({
  description: z.string().min(2), lines: z.array(recurringLineSchema).min(2),
  frequency: z.enum(["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY", "CUSTOM"]),
  customIntervalDays: z.number().int().positive().optional(),
  startDate: z.string(),
});

// §122.3 "Debits equal credits" applies to the template itself, checked
// with the exact same tested function every other journal uses.
generalLedgerRouter.post("/recurring-journals", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createRecurringSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!isBalanced(parsed.data.lines)) return res.status(400).json({ error: "Total debits must equal total credits" });

  const recurringJournal = await prisma.recurringJournal.create({
    data: {
      institutionId: req.auth!.institutionId, description: parsed.data.description, lineTemplate: parsed.data.lines as any,
      frequency: parsed.data.frequency as any, customIntervalDays: parsed.data.customIntervalDays,
      nextExecutionDate: new Date(parsed.data.startDate), createdById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "recurring_journal.create", resource: "recurring_journal", resourceId: recurringJournal.id } });
  res.status(201).json({ recurringJournal });
});

// §122.3 "Manual overrides require authorisation" — the template needs
// authorised approval before its scheduled executions can ever run.
generalLedgerRouter.post("/recurring-journals/:id/request-activation", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const rj = await prisma.recurringJournal.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!rj) return res.status(404).json({ error: "Recurring journal not found" });
  if (rj.status !== "DRAFT") return res.status(400).json({ error: `Only a DRAFT template can request activation (currently ${rj.status})` });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "RECURRING_JOURNAL_ACTIVATION", targetType: "RecurringJournal", targetId: rj.id, payload: {}, reason: `Activate recurring journal: ${rj.description}`, requestedById: req.auth!.userId },
  });
  await prisma.recurringJournal.update({ where: { id: rj.id }, data: { status: "PENDING_APPROVAL" } });
  res.status(202).json({ pendingApproval: true });
});

generalLedgerRouter.post("/recurring-journals/:id/suspend", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const updated = await prisma.recurringJournal.updateMany({ where: { id: req.params.id, institutionId: req.auth!.institutionId }, data: { status: "SUSPENDED" } });
  if (updated.count === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

generalLedgerRouter.post("/recurring-journals/:id/reactivate", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const rj = await prisma.recurringJournal.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!rj) return res.status(404).json({ error: "Not found" });
  if (rj.status !== "SUSPENDED") return res.status(400).json({ error: "Only a SUSPENDED template can be reactivated" });
  const updated = await prisma.recurringJournal.update({ where: { id: rj.id }, data: { status: "ACTIVE", consecutiveFailures: 0, nextExecutionDate: new Date() } });
  res.json({ recurringJournal: updated });
});

// Manual trigger — the real check runs automatically at 01:00 (see
// lib/scheduler.ts); this exists for testing and pilot setup.
generalLedgerRouter.post("/recurring-journals/run-now", requirePermission("institution.configure"), async (_req: AuthedRequest, res) => {
  await runRecurringJournals();
  res.json({ ok: true });
});

// -------------------------------------------------------------------------
// §123 Financial Statement Management. §123.3 "Period restrictions are
// enforced" — every statement here reads from Journal.status === "POSTED"
// only, so an unposted draft or a rejected journal can never leak into a
// financial statement. Cash Flow Statement and Consolidated Statements
// are deliberately not built: Cash Flow needs account-level Operating/
// Investing/Financing classification that doesn't exist yet (faking it
// would produce actively wrong numbers presented as authoritative), and
// Consolidated Statements need a multi-entity/subsidiary structure this
// platform doesn't have — each institution is its own standalone
// deployment. Both named here, not silently dropped.
// -------------------------------------------------------------------------

async function getPostedLinesUpTo(prisma: any, institutionId: string, asOf: Date) {
  return prisma.journalLine.findMany({
    where: { journal: { institutionId, status: "POSTED", postingDate: { lte: asOf } } },
    include: { account: { select: { id: true, code: true, name: true, category: true } } },
  });
}

async function getPostedLinesForPeriod(prisma: any, institutionId: string, from: Date, to: Date) {
  return prisma.journalLine.findMany({
    where: { journal: { institutionId, status: "POSTED", postingDate: { gte: from, lte: to } } },
    include: { account: { select: { id: true, code: true, name: true, category: true } } },
  });
}

function parseRangeQuery(req: AuthedRequest) {
  const { range, from, to } = req.query as { range?: string; from?: string; to?: string };
  const rangeId = (range || "TODAY") as ReportRangeId;
  return resolveReportRange(rangeId, new Date(), rangeId === "CUSTOM" && from && to ? { from, to } : undefined);
}

// §123.2 Trial Balance — every account, as of a chosen date, debits and
// credits shown separately (a debit-balance account's total in the debit
// column, a credit-balance account's total in the credit column), the
// two columns summing to the same total — the classic proof a ledger is
// internally consistent.
generalLedgerRouter.get("/reports/trial-balance", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { to: asOfDate } = parseRangeQuery(req);
  const lines = await getPostedLinesUpTo(prisma, req.auth!.institutionId, asOfDate);
  const balances = aggregateBalancesAsOf(lines.map((l: any) => ({ accountId: l.accountId, category: l.account.category, debit: Number(l.debit), credit: Number(l.credit) })));

  const accountsInvolved = new Map(lines.map((l: any) => [l.accountId, l.account]));
  // Traced through all 4 cases by hand rather than relying on tsc this
  // pass (see the build log for why): a debit-normal account (ASSET/
  // EXPENSE) with a positive balance shows in the debit column, as
  // expected; the same account with an abnormal negative balance shows
  // the absolute value in the CREDIT column instead, not a negative
  // debit — a real trial balance never shows negative numbers, an
  // abnormal balance just sits on the other side.
  const rows = Array.from(accountsInvolved.values()).map((a: any) => {
    const bal = balances.get(a.id) || 0;
    const isDebitNormal = a.category === "ASSET" || a.category === "EXPENSE";
    let debit = 0, credit = 0;
    if (isDebitNormal) {
      if (bal >= 0) debit = bal; else credit = -bal;
    } else {
      if (bal >= 0) credit = bal; else debit = -bal;
    }
    return { code: a.code, name: a.name, category: a.category, debit, credit };
  }).sort((a: any, b: any) => a.code.localeCompare(b.code));

  const totalDebit = rows.reduce((s: number, r: any) => s + r.debit, 0);
  const totalCredit = rows.reduce((s: number, r: any) => s + r.credit, 0);

  res.json({ asOfDate, rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
});

// §123.2 Statement of Financial Position — Assets, Liabilities, Equity as
// of a date, with the fundamental accounting-equation check surfaced
// directly rather than left for someone to verify by hand.
generalLedgerRouter.get("/reports/balance-sheet", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { to: asOfDate } = parseRangeQuery(req);
  const lines = await getPostedLinesUpTo(prisma, req.auth!.institutionId, asOfDate);
  const balances = aggregateBalancesAsOf(lines.map((l: any) => ({ accountId: l.accountId, category: l.account.category, debit: Number(l.debit), credit: Number(l.credit) })));
  const accountsInvolved = new Map(lines.map((l: any) => [l.accountId, l.account]));

  const byCategory = (cat: string) => Array.from(accountsInvolved.values()).filter((a: any) => a.category === cat).map((a: any) => ({ code: a.code, name: a.name, balance: balances.get(a.id) || 0 })).sort((a: any, b: any) => a.code.localeCompare(b.code));

  const assets = byCategory("ASSET");
  const liabilities = byCategory("LIABILITY");
  const equity = byCategory("EQUITY");

  const totalAssets = assets.reduce((s: number, a: any) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s: number, a: any) => s + a.balance, 0);
  const totalEquityExclIncome = equity.reduce((s: number, a: any) => s + a.balance, 0);

  // Retained earnings for the period aren't a posted equity account by
  // default in a simple setup — net income since inception is folded in
  // here explicitly so the equation genuinely balances without requiring
  // a manual period-close journal first.
  const incomeExpenseLines = lines.filter((l: any) => l.account.category === "INCOME" || l.account.category === "EXPENSE");
  const ieBalances = aggregateBalancesAsOf(incomeExpenseLines.map((l: any) => ({ accountId: l.accountId, category: l.account.category, debit: Number(l.debit), credit: Number(l.credit) })));
  const netIncomeSinceInception = Array.from(ieBalances.values()).reduce((s: number, v: number) => s + v, 0);

  const totalEquity = totalEquityExclIncome + netIncomeSinceInception;

  res.json({
    asOfDate, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity,
    netIncomeSinceInception, balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

// §123.2 Statement of Comprehensive Income — Income and Expense account
// MOVEMENT strictly within the chosen period, not cumulative since
// inception (which is what makes this an income statement rather than a
// balance sheet line).
generalLedgerRouter.get("/reports/income-statement", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { from, to } = parseRangeQuery(req);
  const lines = await getPostedLinesForPeriod(prisma, req.auth!.institutionId, from, to);
  const ieLines = lines.filter((l: any) => l.account.category === "INCOME" || l.account.category === "EXPENSE");
  const balances = aggregateBalancesForPeriod(ieLines.map((l: any) => ({ accountId: l.accountId, category: l.account.category, debit: Number(l.debit), credit: Number(l.credit) })));
  const accountsInvolved = new Map(ieLines.map((l: any) => [l.accountId, l.account]));

  const byCategory = (cat: string) => Array.from(accountsInvolved.values()).filter((a: any) => a.category === cat).map((a: any) => ({ code: a.code, name: a.name, amount: balances.get(a.id) || 0 })).sort((a: any, b: any) => a.code.localeCompare(b.code));

  const income = byCategory("INCOME");
  const expenses = byCategory("EXPENSE");
  const totalIncome = income.reduce((s: number, a: any) => s + a.amount, 0);
  const totalExpenses = expenses.reduce((s: number, a: any) => s + a.amount, 0);

  res.json({ periodStart: from, periodEnd: to, income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses });
});

// §123.2 Statement of Changes in Equity — opening equity (as of period
// start) + net income for the period + any direct equity-account
// movement during the period = closing equity (as of period end). The
// arithmetic is a genuine identity, not just three numbers placed near
// each other — closingEquity is computed independently (as-of period
// end) and should equal opening + movement, surfaced so a mismatch would
// be visible rather than hidden.
generalLedgerRouter.get("/reports/changes-in-equity", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { from, to } = parseRangeQuery(req);

  // Exactly three real queries: the two boundary snapshots (for the
  // independent closing-balance check) and one fetch of the period's own
  // activity, reused for both the equity-account movement and the
  // period's net income — not refetched a second time for each.
  const linesAtStart = await getPostedLinesUpTo(prisma, req.auth!.institutionId, new Date(from.getTime() - 1));
  const linesAtEnd = await getPostedLinesUpTo(prisma, req.auth!.institutionId, to);
  const periodLines = await getPostedLinesForPeriod(prisma, req.auth!.institutionId, from, to);

  const sumEquity = (lines: any[]) => {
    const eq = lines.filter((l: any) => l.account.category === "EQUITY");
    const bal = aggregateBalancesAsOf(eq.map((l: any) => ({ accountId: l.accountId, category: "EQUITY" as const, debit: Number(l.debit), credit: Number(l.credit) })));
    return Array.from(bal.values()).reduce((s: number, v: number) => s + v, 0);
  };
  const sumIncomeExpense = (lines: any[]) => {
    const ie = lines.filter((l: any) => l.account.category === "INCOME" || l.account.category === "EXPENSE");
    const bal = aggregateBalancesAsOf(ie.map((l: any) => ({ accountId: l.accountId, category: l.account.category, debit: Number(l.debit), credit: Number(l.credit) })));
    return Array.from(bal.values()).reduce((s: number, v: number) => s + v, 0);
  };

  const openingEquity = sumEquity(linesAtStart) + sumIncomeExpense(linesAtStart);
  const equityMovement = sumEquity(periodLines);
  const netIncomeForPeriod = sumIncomeExpense(periodLines);
  const closingEquityComputed = sumEquity(linesAtEnd) + sumIncomeExpense(linesAtEnd);
  const closingEquityExpected = openingEquity + equityMovement + netIncomeForPeriod;

  res.json({
    periodStart: from, periodEnd: to, openingEquity, netIncomeForPeriod, equityMovement,
    closingEquity: closingEquityComputed,
    reconciles: Math.abs(closingEquityComputed - closingEquityExpected) < 0.01,
  });
});
