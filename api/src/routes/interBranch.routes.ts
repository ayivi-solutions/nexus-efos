import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { round2 } from "../lib/generalLedger";

// doc §121 Inter-Branch Accounting. Every transfer becomes a single, real
// 4-line Journal via the Approval Workflow — the actual posting logic
// lives in approvals.routes.ts's apply-side switch, reusing the exact
// same debit=credit and balance-effect engine every other journal uses,
// not a separate, parallel implementation.
export const interBranchRouter = Router();
interBranchRouter.use(requireAuth);

// -------------------------------------------------------------------------
// Settlement Account setup — one per branch, a Due To/Due From clearing
// account whose balance can legitimately sit on either side depending on
// the branch's net position.
// -------------------------------------------------------------------------

interBranchRouter.get("/settlement-accounts", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const accounts = await prisma.branchSettlementAccount.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { glAccount: { select: { code: true, name: true, balance: true } } },
  });
  const branches = await prisma.branch.findMany({ where: { institutionId: req.auth!.institutionId }, select: { id: true, name: true } });
  const branchName = new Map(branches.map((b: any) => [b.id, b.name]));
  res.json({ accounts: accounts.map((a: any) => ({ ...a, branchName: branchName.get(a.branchId) || a.branchId })) });
});

const setupSchema = z.object({ branchId: z.string(), glAccountCode: z.string(), glAccountName: z.string() });

// Creates a real GLAccount (LIABILITY-normal by default, though a
// settlement account genuinely can run either side) and links it to the
// branch as its settlement point — a single step rather than requiring
// someone to separately create the account first.
interBranchRouter.post("/settlement-accounts", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.branchSettlementAccount.findUnique({ where: { branchId: parsed.data.branchId } });
  if (existing) return res.status(400).json({ error: "This branch already has a settlement account" });

  const glAccount = await prisma.gLAccount.create({
    data: { institutionId: req.auth!.institutionId, code: parsed.data.glAccountCode, name: parsed.data.glAccountName, category: "LIABILITY", branchId: parsed.data.branchId },
  });
  const settlementAccount = await prisma.branchSettlementAccount.create({
    data: { institutionId: req.auth!.institutionId, branchId: parsed.data.branchId, glAccountId: glAccount.id },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "branch_settlement_account.create", resource: "branch_settlement_account", resourceId: settlementAccount.id } });
  res.status(201).json({ settlementAccount });
});

// -------------------------------------------------------------------------
// Inter-Branch Transfers
// -------------------------------------------------------------------------

interBranchRouter.get("/transfers", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const transfers = await prisma.interBranchTransfer.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ transfers });
});

const transferSchema = z.object({
  fromBranchId: z.string(), toBranchId: z.string(), fromGLAccountId: z.string(), toGLAccountId: z.string(),
  amount: z.number().positive(), description: z.string().min(2),
});

// §121.3 "Every transaction is audited" + Approval Workflow — a transfer
// is requested here, and only actually posted (as a real, balanced
// journal) once a different authorised user approves it.
interBranchRouter.post("/transfers", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.fromBranchId === parsed.data.toBranchId) return res.status(400).json({ error: "Source and destination branches must differ" });

  const fromSettlement = await prisma.branchSettlementAccount.findUnique({ where: { branchId: parsed.data.fromBranchId } });
  const toSettlement = await prisma.branchSettlementAccount.findUnique({ where: { branchId: parsed.data.toBranchId } });
  if (!fromSettlement || !toSettlement) return res.status(400).json({ error: "Both branches must have a settlement account set up first" });

  const transfer = await prisma.interBranchTransfer.create({
    data: { institutionId: req.auth!.institutionId, ...parsed.data, requestedById: req.auth!.userId },
  });

  await prisma.approvalRequest.create({
    data: { institutionId: req.auth!.institutionId, type: "INTER_BRANCH_TRANSFER", targetType: "InterBranchTransfer", targetId: transfer.id, payload: {}, reason: parsed.data.description, requestedById: req.auth!.userId },
  });

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "inter_branch_transfer.requested", resource: "inter_branch_transfer", resourceId: transfer.id, metadata: { amount: parsed.data.amount } } });

  res.status(202).json({ pendingApproval: true, transfer });
});

// -------------------------------------------------------------------------
// §121.2 "Outstanding Balance Monitoring" / "Settlement Reports"
// -------------------------------------------------------------------------

interBranchRouter.get("/reports/outstanding-balances", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const accounts = await prisma.branchSettlementAccount.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { glAccount: { select: { code: true, name: true, balance: true, category: true } } },
  });
  const branches = await prisma.branch.findMany({ where: { institutionId: req.auth!.institutionId }, select: { id: true, name: true } });
  const branchName = new Map(branches.map((b: any) => [b.id, b.name]));

  const rows = accounts.map((a: any) => {
    const isDebitNormal = a.glAccount.category === "ASSET" || a.glAccount.category === "EXPENSE";
    const bal = Number(a.glAccount.balance);
    // A positive balance on a liability-normal settlement account (the
    // default) means this branch is net owed by other branches (Due
    // From); a negative balance means it owes them (Due To) — surfaced
    // plainly rather than left as a raw signed number to interpret.
    const position = isDebitNormal ? (bal >= 0 ? "Due From others" : "Due To others") : (bal >= 0 ? "Due To others" : "Due From others");
    return { branchId: a.branchId, branchName: branchName.get(a.branchId) || a.branchId, accountCode: a.glAccount.code, balance: bal, position };
  });

  // §121.3 "Settlement accounts reconcile correctly" — the real
  // invariant, checked and surfaced directly: every branch's settlement
  // balance, summed across the institution, must net to zero.
  const netTotal = round2(rows.reduce((s: number, r: any) => s + r.balance, 0));

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "gl_report.generated", resource: "gl_report", resourceId: "inter-branch-outstanding", metadata: {} } });

  res.json({ rows, netTotal, reconciles: Math.abs(netTotal) < 0.01 });
});
