import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { outstandingLoansWithBalance, parRatio } from "../lib/portfolio";
import { round2 } from "../lib/generalLedger";
import { generateDashboardNarrative } from "../lib/executiveNarrative";

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

  const [customers, loans, savingsAccounts, complaints] = await Promise.all([
    prisma.customer.findMany({ where: { institutionId } }),
    prisma.loan.findMany({ where: { institutionId }, include: { repayments: true, installments: true } }),
    prisma.savingsAccount.findMany({ where: { institutionId }, include: { transactions: true } }),
    prisma.customerComplaint.findMany({ where: { institutionId }, select: { createdAt: true } }),
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
  let totalPrincipal = 0, totalDisbursed = 0, totalRepaid = 0, totalOutstanding = 0;
  for (const l of loans) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    totalPrincipal += Number(l.principal);
    if (["DISBURSED", "ACTIVE", "CLOSED"].includes(l.status)) totalDisbursed += Number(l.principal);
    for (const r of l.repayments) totalRepaid += Number(r.amount);

    // doc §70 — prefer the real amortization schedule (principal + interest
    // still outstanding) over the older principal-minus-repayments proxy,
    // for loans that have one.
    if (l.installments.length > 0) {
      for (const inst of l.installments) {
        totalOutstanding += Math.max(Number(inst.totalDue) - Number(inst.principalPaid) - Number(inst.interestPaid), 0);
      }
    } else if (["DISBURSED", "ACTIVE"].includes(l.status)) {
      const repaid = l.repayments.reduce((s, r) => s + Number(r.amount), 0);
      totalOutstanding += Math.max(Number(l.principal) - repaid, 0);
    }
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
  const trend: Record<string, { disbursed: number; deposits: number; withdrawals: number; newCustomers: number; complaints: number }> = {};
  for (const m of monthList) trend[m] = { disbursed: 0, deposits: 0, withdrawals: 0, newCustomers: 0, complaints: 0 };
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
  for (const c of customers) {
    const k = monthKey(new Date(c.createdAt));
    if (trend[k]) trend[k].newCustomers += 1;
  }
  for (const cp of complaints) {
    const k = monthKey(new Date(cp.createdAt));
    if (trend[k]) trend[k].complaints += 1;
  }

  const trendArray = monthList.map((m) => ({ month: m, ...trend[m] }));

  res.json({
    customers: { total: customers.length, bySegment, byStage, byKyc },
    loans: { total: loans.length, byStatus, totalPrincipal, totalDisbursed, totalOutstanding },
    savings: { totalAccounts: savingsAccounts.length, totalBalance: totalSavingsBalance, totalDeposits, totalWithdrawals },
    trend: trendArray,
    // EAIS §148.2 "dashboard narrative, trend and variance analysis" —
    // see lib/executiveNarrative.ts for why this is templated from real
    // numbers rather than a generative-AI call.
    narrative: generateDashboardNarrative(trendArray),
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
  // doc §77 Loan Arrears Management / §76 Portfolio Management "PAR
  // Benchmark" — real arrears data (the scheduled daily check in
  // lib/scheduler.ts). Outstanding portfolio and PAR30 now come from
  // lib/portfolio.ts's shared calculation — the same one the Portfolio
  // Analytics dashboard uses — rather than a second, independent
  // computation. The previous version here used raw principal (the
  // original loan amount, not actual outstanding balance) and inferred
  // "at risk" from arrears-bucket labels instead of the daysInArrears
  // threshold directly; the two views could disagree on PAR for the
  // same institution at the same moment. Fixed by sharing one source of
  // truth instead of two independent approximations.
  const arrearsAging = { CURRENT: 0, ARREARS_1_30: 0, ARREARS_31_60: 0, ARREARS_61_90: 0, ARREARS_90_PLUS: 0 };

  for (const l of filtered) {
    const branchName = l.branch?.name || "Unassigned";
    byBranch[branchName] = byBranch[branchName] || { count: 0, principal: 0 };
    byBranch[branchName].count += 1;
    byBranch[branchName].principal += Number(l.principal);
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;

    if (["DISBURSED", "ACTIVE"].includes(l.status)) {
      arrearsAging[l.arrearsClassification as keyof typeof arrearsAging]++;
    }
  }

  const outstandingLoans = await outstandingLoansWithBalance(institutionId);
  const outstandingPortfolio = outstandingLoans.reduce((s, l) => s + l.outstanding, 0);
  const atRiskPortfolio = outstandingLoans.filter((l) => l.daysInArrears > 30).reduce((s, l) => s + l.outstanding, 0);
  const parPercent = parRatio(outstandingLoans, 30);

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
      arrearsClassification: l.arrearsClassification,
      daysInArrears: l.daysInArrears,
      arrearsAmount: l.arrearsAmount,
    })),
    byBranch,
    byStatus,
    arrearsAging,
    portfolioAtRisk: { outstandingPortfolio: round2(outstandingPortfolio), atRiskPortfolio: round2(atRiskPortfolio), parPercent },
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

// -----------------------------------------------------------------------
// Cheque Register Report
// -----------------------------------------------------------------------
reportsRouter.get("/cheques", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const cheques = await prisma.cheque.findMany({
    where: { institutionId },
    orderBy: { createdAt: "desc" },
  });
  const filtered = cheques.filter((c: any) => inRange(new Date(c.createdAt), from, to));

  const byStatus: Record<string, number> = {};
  const byDirection: Record<string, number> = {};
  let totalAmount = 0;
  let bouncedCount = 0;
  let pendingConfirmationCount = 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const c of filtered) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byDirection[c.direction] = (byDirection[c.direction] || 0) + 1;
    totalAmount += Number(c.amount);
    if (c.status === "BOUNCED") bouncedCount++;
    if (!["CLEARED", "BOUNCED", "STOPPED", "CANCELLED"].includes(c.status) && (!c.confirmedAt || new Date(c.confirmedAt) < todayStart)) {
      pendingConfirmationCount++;
    }
  }
  const submittedOrBeyond = filtered.filter((c: any) => ["PENDING_CLEARING", "CLEARED", "BOUNCED"].includes(c.status)).length;
  const bounceRate = submittedOrBeyond > 0 ? round2((bouncedCount / submittedOrBeyond) * 100) : 0;

  res.json({
    cheques: filtered.map((c: any) => ({
      id: c.id, direction: c.direction, chequeNumber: c.chequeNumber, bankName: c.bankName,
      chequeDate: c.chequeDate, amount: c.amount, status: c.status,
      payerName: c.payerName, payeeName: c.payeeName, confirmedAt: c.confirmedAt, createdAt: c.createdAt,
    })),
    total: filtered.length,
    totalAmount: round2(totalAmount),
    byStatus,
    byDirection,
    bounceRate,
    pendingConfirmationCount,
  });
});

// -----------------------------------------------------------------------
// Customer Care Report — EFS §157 Interactions + §160 Complaints
// -----------------------------------------------------------------------
reportsRouter.get("/customer-care", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const [interactions, complaints] = await Promise.all([
    prisma.customerInteraction.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
    prisma.customerComplaint.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
  ]);
  const filteredInteractions = interactions.filter((i: any) => inRange(new Date(i.createdAt), from, to));
  const filteredComplaints = complaints.filter((c: any) => inRange(new Date(c.createdAt), from, to));

  const byChannel: Record<string, number> = {};
  let followUpsScheduled = 0;
  let followUpsCompleted = 0;
  for (const i of filteredInteractions) {
    byChannel[i.channel] = (byChannel[i.channel] || 0) + 1;
    if (i.followUpScheduledAt) followUpsScheduled++;
    if (i.followUpCompleted) followUpsCompleted++;
  }

  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let resolvedCount = 0;
  let totalResolutionHours = 0;
  let escalatedCount = 0;
  for (const c of filteredComplaints) {
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    byPriority[c.priority] = (byPriority[c.priority] || 0) + 1;
    if (c.escalated) escalatedCount++;
    if (c.resolvedAt) {
      resolvedCount++;
      totalResolutionHours += (new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
    }
  }
  const avgResolutionHours = resolvedCount > 0 ? round2(totalResolutionHours / resolvedCount) : 0;
  const escalationRate = filteredComplaints.length > 0 ? round2((escalatedCount / filteredComplaints.length) * 100) : 0;

  res.json({
    interactions: { total: filteredInteractions.length, byChannel, followUpsScheduled, followUpsCompleted },
    complaints: {
      total: filteredComplaints.length,
      byCategory, byPriority,
      resolvedCount,
      avgResolutionHours,
      escalationRate,
      list: filteredComplaints.map((c: any) => ({
        id: c.id, referenceNumber: c.referenceNumber, category: c.category, priority: c.priority,
        status: c.status, escalated: c.escalated, createdAt: c.createdAt, resolvedAt: c.resolvedAt,
      })),
    },
  });
});

// -----------------------------------------------------------------------
// HR Report — EFS §201 Attendance + §203 Performance + ETAS §41.4 Disciplinary
// -----------------------------------------------------------------------
reportsRouter.get("/hr", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const [attendance, reviews, cases] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { institutionId }, orderBy: { workDate: "desc" } }),
    prisma.performanceReview.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
    prisma.disciplinaryCase.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
  ]);
  const filteredAttendance = attendance.filter((a: any) => inRange(new Date(a.workDate), from, to));
  const filteredReviews = reviews.filter((r: any) => inRange(new Date(r.createdAt), from, to));
  const filteredCases = cases.filter((c: any) => inRange(new Date(c.createdAt), from, to));

  const correctionsPending = filteredAttendance.filter((a: any) => a.correctionPending).length;

  const reviewsByStatus: Record<string, number> = {};
  const reviewsByRating: Record<string, number> = {};
  for (const r of filteredReviews) {
    reviewsByStatus[r.status] = (reviewsByStatus[r.status] || 0) + 1;
    if (r.rating) reviewsByRating[r.rating] = (reviewsByRating[r.rating] || 0) + 1;
  }
  const completionRate = filteredReviews.length > 0
    ? round2((filteredReviews.filter((r: any) => r.status === "COMPLETED").length / filteredReviews.length) * 100)
    : 0;

  const casesByStatus: Record<string, number> = {};
  const casesByAction: Record<string, number> = {};
  for (const c of filteredCases) {
    casesByStatus[c.status] = (casesByStatus[c.status] || 0) + 1;
    if (c.actionTaken) casesByAction[c.actionTaken] = (casesByAction[c.actionTaken] || 0) + 1;
  }

  res.json({
    attendance: { total: filteredAttendance.length, correctionsPending },
    performance: { total: filteredReviews.length, byStatus: reviewsByStatus, byRating: reviewsByRating, completionRate },
    disciplinary: { total: filteredCases.length, byStatus: casesByStatus, byAction: casesByAction },
  });
});

// -----------------------------------------------------------------------
// Internal Audit Report — EFS §298/§299, ETAS §78
// -----------------------------------------------------------------------
reportsRouter.get("/internal-audit", async (req: AuthedRequest, res) => {
  const institutionId = req.auth!.institutionId;
  const { from, to } = parseRange(req);

  const [engagements, findings] = await Promise.all([
    prisma.auditEngagement.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
    prisma.auditFinding.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
  ]);
  const filteredEngagements = engagements.filter((e: any) => inRange(new Date(e.createdAt), from, to));
  const filteredFindings = findings.filter((f: any) => inRange(new Date(f.createdAt), from, to));

  const engagementsByStatus: Record<string, number> = {};
  for (const e of filteredEngagements) engagementsByStatus[e.status] = (engagementsByStatus[e.status] || 0) + 1;

  const findingsByRisk: Record<string, number> = {};
  const findingsByStatus: Record<string, number> = {};
  let overdueCount = 0;
  let unassignedCount = 0;
  for (const f of filteredFindings) {
    findingsByRisk[f.riskClassification] = (findingsByRisk[f.riskClassification] || 0) + 1;
    findingsByStatus[f.status] = (findingsByStatus[f.status] || 0) + 1;
    if (f.overdue) overdueCount++;
    if (!f.actionOwnerId) unassignedCount++;
  }
  const overdueRate = filteredFindings.length > 0 ? round2((overdueCount / filteredFindings.length) * 100) : 0;

  res.json({
    engagements: { total: filteredEngagements.length, byStatus: engagementsByStatus },
    findings: {
      total: filteredFindings.length,
      byRisk: findingsByRisk,
      byStatus: findingsByStatus,
      overdueCount,
      overdueRate,
      unassignedCount,
      list: filteredFindings.map((f: any) => ({
        id: f.id, referenceNumber: f.referenceNumber, riskClassification: f.riskClassification,
        status: f.status, overdue: f.overdue, targetRemediationDate: f.targetRemediationDate, createdAt: f.createdAt,
      })),
    },
  });
});
