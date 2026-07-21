import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastNMonths(n: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

// doc §80 — Reporting and Visualisation Architecture. Aggregated, in-memory
// summary appropriate for current data volume; revisit with SQL-level
// aggregation once transaction volume grows.
reportsRouter.get("/overview", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;

  const [customers, loans, savingsAccounts] = await Promise.all([
    prisma.customer.findMany({ where: { institutionId } }),
    prisma.loan.findMany({ where: { institutionId }, include: { repayments: true } }),
    prisma.savingsAccount.findMany({ where: { institutionId }, include: { transactions: true } }),
  ]);

  const bySegment: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const byKyc: Record<string, number> = {};
  for (const c of customers) {
    bySegment[c.segment] = (bySegment[c.segment] || 0) + 1;
    byStage[c.lifecycleStage] = (byStage[c.lifecycleStage] || 0) + 1;
    byKyc[c.kycStatus] = (byKyc[c.kycStatus] || 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  let totalPrincipal = 0;
  let totalDisbursed = 0;
  let totalRepaid = 0;
  for (const l of loans) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    totalPrincipal += Number(l.principal);
    if (["DISBURSED", "ACTIVE", "CLOSED"].includes(l.status)) totalDisbursed += Number(l.principal);
    for (const r of l.repayments) totalRepaid += Number(r.amount);
  }

  let totalSavingsBalance = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  for (const a of savingsAccounts) {
    totalSavingsBalance += Number(a.balance);
    for (const t of a.transactions) {
      if (t.type === "DEPOSIT") totalDeposits += Number(t.amount);
      else totalWithdrawals += Number(t.amount);
    }
  }

  const months = lastNMonths(6);
  const trend: Record<string, { disbursed: number; deposits: number; withdrawals: number }> = {};
  for (const m of months) trend[m] = { disbursed: 0, deposits: 0, withdrawals: 0 };
  for (const l of loans) {
    if (l.disbursedAt) {
      const k = monthKey(new Date(l.disbursedAt));
      if (trend[k]) trend[k].disbursed += Number(l.principal);
    }
  }
  for (const a of savingsAccounts) {
    for (const t of a.transactions) {
      const k = monthKey(new Date(t.createdAt));
      if (!trend[k]) continue;
      if (t.type === "DEPOSIT") trend[k].deposits += Number(t.amount);
      else trend[k].withdrawals += Number(t.amount);
    }
  }

  res.json({
    customers: { total: customers.length, bySegment, byStage, byKyc },
    loans: {
      total: loans.length,
      byStatus,
      totalPrincipal,
      totalDisbursed,
      totalOutstanding: Math.max(totalDisbursed - totalRepaid, 0),
    },
    savings: {
      totalAccounts: savingsAccounts.length,
      totalBalance: totalSavingsBalance,
      totalDeposits,
      totalWithdrawals,
    },
    trend: months.map((m) => ({ month: m, ...trend[m] })),
  });
});
