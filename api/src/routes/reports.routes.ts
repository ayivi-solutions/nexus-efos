import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);
reportsRouter.use(requirePermission("reports.view"));

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

function parseRange(req: AuthedRequest) {
  const { from, to } = req.query as { from?: string; to?: string };
  return {
    from: from ? new Date(from) : null,
    to: to ? new Date(to) : null,
  };
}

function inRange(date: Date, from: Date | null, to: Date | null) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

// doc §80 — Reporting and Visualisation Architecture (Operational, Customer
// and Financial Reporting domains; AI-generated/scheduled-distribution/
// regulatory-submission domains are explicitly out of scope until §61/§78
// infrastructure exists).

reportsRouter.get("/overview", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const months = Math.min(Math.max(Number((req.query as any).months) || 6, 1), 24);

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
  let totalPrincipal = 0, totalDisbursed = 0, totalRepaid = 0;
  for (const l of loans) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    totalPrincipal += Number(l.principal);
    if (["DISBURSED", "ACTIVE", "CLOSED"].includes(l.status)) totalDisbursed += Number(l.principal);
    for (const r of l.repayments) totalRepaid += Number(r.amount);
  }

  let totalSavingsBalance = 0, totalDeposits = 0, totalWithdrawals = 0;
  for (const a of savingsAccounts) {
    totalSavingsBalance += Number(a.balance);
    for (const t of a.transactions) {
      if (t.type === "DEPOSIT") totalDeposits += Number(t.amount);
      else totalWithdrawals += Number(t.amount);
    }
  }

  const monthList = lastNMonths(months);
  const trend: Record<string, { disbursed: number; deposits: number; withdrawals: number }> = {};
  for (const m of monthList) trend[m] = { disbursed: 0, deposits: 0, withdrawals: 0 };
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
    loans: { total: loans.length, byStatus, totalPrincipal, totalDisbursed, totalOutstanding: Math.max(totalDisbursed - totalRepaid, 0) },
    savings: { totalAccounts: savingsAccounts.length, totalBalance: totalSavingsBalance, totalDeposits, totalWithdrawals },
    trend: monthList.map((m) => ({ month: m, ...trend[m] })),
  });
});

// Loan Portfolio Report — doc §80.5 Financial + Customer Reporting
reportsRouter.get("/loans", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const loans = await prisma.loan.findMany({
    where: { institutionId },
    include: { customer: { select: { fullName: true, phone: true } }, branch: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const filtered = loans.filter((l) => inRange(new Date(l.createdAt), from, to));

  const byBranch: Record<string, { count: number; principal: number }> = {};
  const byStatus: Record<string, number> = {};
  const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const now = Date.now();

  for (const l of filtered) {
    const branchName = l.branch?.name || "Unassigned";
    byBranch[branchName] = byBranch[branchName] || { count: 0, principal: 0 };
    byBranch[branchName].count += 1;
    byBranch[branchName].principal += Number(l.principal);
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;

    if (["DISBURSED", "ACTIVE"].includes(l.status) && l.disbursedAt) {
      const days = Math.floor((now - new Date(l.disbursedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 30) aging["0-30"]++;
      else if (days <= 60) aging["31-60"]++;
      else if (days <= 90) aging["61-90"]++;
      else aging["90+"]++;
    }
  }

  res.json({
    loans: filtered.map((l) => ({
      id: l.id,
      customer: l.customer.fullName,
      phone: l.customer.phone,
      branch: l.branch?.name || "Unassigned",
      principal: l.principal,
      interestRate: l.interestRate,
      termMonths: l.termMonths,
      status: l.status,
      createdAt: l.createdAt,
      disbursedAt: l.disbursedAt,
    })),
    byBranch,
    byStatus,
    aging,
  });
});

// Savings Report — doc §80.5 Financial + Customer Reporting
reportsRouter.get("/savings", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const accounts = await prisma.savingsAccount.findMany({
    where: { institutionId },
    include: { customer: { select: { fullName: true } }, branch: { select: { name: true } }, transactions: true },
    orderBy: { balance: "desc" },
  });

  const byBranch: Record<string, { count: number; balance: number }> = {};
  let netFlowDeposits = 0, netFlowWithdrawals = 0;

  for (const a of accounts) {
    const branchName = a.branch?.name || "Unassigned";
    byBranch[branchName] = byBranch[branchName] || { count: 0, balance: 0 };
    byBranch[branchName].count += 1;
    byBranch[branchName].balance += Number(a.balance);

    for (const t of a.transactions) {
      if (!inRange(new Date(t.createdAt), from, to)) continue;
      if (t.type === "DEPOSIT") netFlowDeposits += Number(t.amount);
      else netFlowWithdrawals += Number(t.amount);
    }
  }

  res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      customer: a.customer.fullName,
      branch: a.branch?.name || "Unassigned",
      balance: a.balance,
      status: a.status,
      createdAt: a.createdAt,
    })),
    byBranch,
    netFlowDeposits,
    netFlowWithdrawals,
    topAccounts: accounts.slice(0, 10).map((a) => ({ accountNumber: a.accountNumber, customer: a.customer.fullName, balance: a.balance })),
  });
});

// Customer Report — doc §80.5 Customer Reporting
reportsRouter.get("/customers", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const customers = await prisma.customer.findMany({
    where: { institutionId },
    include: { branch: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const bySegment: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const byKyc: Record<string, number> = {};
  const byBranch: Record<string, number> = {};
  let newInRange = 0;

  for (const c of customers) {
    bySegment[c.segment] = (bySegment[c.segment] || 0) + 1;
    byStage[c.lifecycleStage] = (byStage[c.lifecycleStage] || 0) + 1;
    byKyc[c.kycStatus] = (byKyc[c.kycStatus] || 0) + 1;
    const branchName = c.branch?.name || "Unassigned";
    byBranch[branchName] = (byBranch[branchName] || 0) + 1;
    if (inRange(new Date(c.createdAt), from, to)) newInRange++;
  }

  const verified = byKyc["VERIFIED"] || 0;
  const kycComplianceRate = customers.length ? Math.round((verified / customers.length) * 1000) / 10 : 0;

  res.json({
    customers: customers.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      branch: c.branch?.name || "Unassigned",
      segment: c.segment,
      lifecycleStage: c.lifecycleStage,
      kycStatus: c.kycStatus,
      createdAt: c.createdAt,
    })),
    total: customers.length,
    newInRange,
    kycComplianceRate,
    bySegment,
    byStage,
    byKyc,
    byBranch,
  });
});
