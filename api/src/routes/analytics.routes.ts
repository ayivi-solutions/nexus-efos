import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { round2, linearTrendForecast } from "../lib/generalLedger";

// doc §125 Financial Analytics. §125.2 lists 10 functional pieces; built
// here are the ones genuinely computable from real data that already
// exists: Revenue/Expense/Profitability trends, Branch Performance, and
// a disclosed simple trend forecast. Product Profitability and Cost
// Centre Analysis need a GL dimension (product/cost-centre tagging on
// journal lines) that doesn't exist anywhere in the schema yet — building
// either now would mean inventing relationships with no real data behind
// them, the same category of gap as the still-pending GL auto-posting
// integration. Budget Variance Analysis needs an actual budget-entry
// feature (creating and approving planned figures) — a genuinely
// separate undertaking from a report. AI-Based Financial Insights waits
// on the AI spec; everything here is real, disclosed technique, not a
// stand-in presented as AI.
export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

function monthBounds(monthsAgo: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59, 999);
  const label = start.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return { start, end, label };
}

async function monthlyIncomeExpense(institutionId: string, monthsAgo: number) {
  const { start, end, label } = monthBounds(monthsAgo);
  const lines = await prisma.journalLine.findMany({
    where: { journal: { institutionId, status: "POSTED", postingDate: { gte: start, lte: end } } },
    include: { account: { select: { category: true } } },
  });
  const ie = lines.filter((l: any) => l.account.category === "INCOME" || l.account.category === "EXPENSE");

  let income = 0, expense = 0;
  for (const l of ie) {
    if (l.account.category === "INCOME") income += Number(l.credit) - Number(l.debit);
    else expense += Number(l.debit) - Number(l.credit);
  }
  return { label, periodStart: start, periodEnd: end, income: round2(income), expense: round2(expense), netIncome: round2(income - expense) };
}

// §125.2 "Revenue Analysis" / "Expense Analysis" / "Profitability
// Analysis" — the same real data, over the last N months (default 6),
// oldest first, so a chart or table reads left-to-right chronologically.
analyticsRouter.get("/trends/profitability", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const months = Math.min(Math.max(Number((req.query as any).months) || 6, 2), 24);
  const results = [];
  for (let m = months - 1; m >= 0; m--) {
    results.push(await monthlyIncomeExpense(req.auth!.institutionId, m));
  }

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "gl_report.generated", resource: "gl_report", resourceId: "profitability-trend", metadata: { months } } });

  res.json({ months: results });
});

// §125.2 "Financial Forecasting" — a real, disclosed linear projection
// from the same trend data above, not a separate implementation.
analyticsRouter.get("/forecast/net-income", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const months = Math.min(Math.max(Number((req.query as any).months) || 6, 2), 24);
  const results = [];
  for (let m = months - 1; m >= 0; m--) {
    results.push(await monthlyIncomeExpense(req.auth!.institutionId, m));
  }
  const forecast = linearTrendForecast(results.map((r) => r.netIncome));

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "gl_report.generated", resource: "gl_report", resourceId: "net-income-forecast", metadata: { months } } });

  res.json({ history: results, forecast: { ...forecast, method: "simple linear trend — not AI, not a sophisticated predictive model, a transparent straight-line projection from recent history" } });
});

// §125.2 "Branch Performance" — real income/expense per branch-tagged
// account over a period, extending the same by-branch pattern from GL
// Reporting (§124) with a profitability angle rather than just a
// point-in-time balance.
analyticsRouter.get("/branch-performance", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const { start, end } = monthBounds(0);
  const lines = await prisma.journalLine.findMany({
    where: { journal: { institutionId: req.auth!.institutionId, status: "POSTED", postingDate: { gte: start, lte: end } } },
    include: { account: { select: { category: true, branchId: true } } },
  });
  const ie = lines.filter((l: any) => l.account.category === "INCOME" || l.account.category === "EXPENSE");
  const branches = await prisma.branch.findMany({ where: { institutionId: req.auth!.institutionId }, select: { id: true, name: true } });
  const branchName = new Map(branches.map((b: any) => [b.id, b.name]));

  const byBranch = new Map<string, { income: number; expense: number }>();
  for (const l of ie) {
    const key = l.account.branchId || "unassigned";
    if (!byBranch.has(key)) byBranch.set(key, { income: 0, expense: 0 });
    const entry = byBranch.get(key)!;
    if (l.account.category === "INCOME") entry.income += Number(l.credit) - Number(l.debit);
    else entry.expense += Number(l.debit) - Number(l.credit);
  }

  const rows = Array.from(byBranch.entries()).map(([branchId, v]) => ({
    branchId: branchId === "unassigned" ? null : branchId,
    branchName: branchId === "unassigned" ? "Unassigned (institution-wide)" : branchName.get(branchId) || branchId,
    income: round2(v.income), expense: round2(v.expense), netIncome: round2(v.income - v.expense),
  })).sort((a, b) => b.netIncome - a.netIncome);

  await prisma.auditLog.create({ data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "gl_report.generated", resource: "gl_report", resourceId: "branch-performance", metadata: {} } });

  res.json({ periodStart: start, periodEnd: end, branches: rows });
});
