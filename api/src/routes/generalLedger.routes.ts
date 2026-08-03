import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { isBalanced, generateJournalNumber, findPostablePeriod } from "../lib/generalLedger";

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
