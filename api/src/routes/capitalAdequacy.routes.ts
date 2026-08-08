import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { round2 } from "../lib/generalLedger";
import {
  MIN_CET1_RATIO, CCB1, MIN_TIER1_RATIO, MIN_CAR, MAX_AT1_OF_RWA, MAX_TIER2_OF_RWA,
  NPL_CEILING_MICROFINANCE, PAST_DUE_THRESHOLD_DAYS,
  classifyLoanForRegulatory, loanRiskWeightPercent,
} from "../lib/capitalAdequacy";

// BOG Capital Requirements Directive, 2018 (uploaded source document) +
// Act 930 §29 + BOG Governor's 5 Aug 2026 NPL directive. See
// lib/capitalAdequacy.ts for the full methodology and disclosed gaps.
export const capitalAdequacyRouter = Router();
capitalAdequacyRouter.use(requireAuth);

const OUTSTANDING_LOAN_STATUSES = ["DISBURSED", "ACTIVE", "DEFAULTED"];

async function computeSnapshot(institutionId: string) {
  // --- Capital (numerator) — from GLAccount.capitalTier-tagged accounts ---
  const capitalAccounts = await prisma.gLAccount.findMany({
    where: { institutionId, capitalTier: { not: null } },
    select: { balance: true, capitalTier: true },
  });
  let rawCet1 = 0, rawAt1 = 0, rawTier2 = 0;
  for (const a of capitalAccounts) {
    const bal = Number(a.balance);
    if (a.capitalTier === "CET1") rawCet1 += bal;
    else if (a.capitalTier === "ADDITIONAL_TIER1") rawAt1 += bal;
    else if (a.capitalTier === "TIER2") rawTier2 += bal;
  }

  // --- Loan RWA ---
  const loans = await prisma.loan.findMany({
    where: { institutionId, status: { in: OUTSTANDING_LOAN_STATUSES as any } },
    select: {
      principal: true, daysInArrears: true,
      customer: { select: { segment: true } },
      installments: { select: { principalPaid: true } },
    },
  });
  let loanRWA = 0, grossLoans = 0, nplLoans = 0;
  const classificationCounts: Record<string, { count: number; outstanding: number }> = {
    CURRENT: { count: 0, outstanding: 0 }, OLEM: { count: 0, outstanding: 0 },
    SUBSTANDARD: { count: 0, outstanding: 0 }, DOUBTFUL: { count: 0, outstanding: 0 }, LOSS: { count: 0, outstanding: 0 },
  };
  for (const l of loans) {
    const principalPaid = l.installments.reduce((s: number, i: any) => s + Number(i.principalPaid), 0);
    const outstanding = Math.max(0, round2(Number(l.principal) - principalPaid));
    grossLoans += outstanding;
    const rw = loanRiskWeightPercent({ outstanding, daysInArrears: l.daysInArrears, customerSegment: l.customer.segment });
    loanRWA += outstanding * (rw / 100);
    const { classification } = classifyLoanForRegulatory(l.daysInArrears);
    classificationCounts[classification].count++;
    classificationCounts[classification].outstanding += outstanding;
    if (l.daysInArrears > PAST_DUE_THRESHOLD_DAYS) nplLoans += outstanding;
  }

  // --- Other (non-loan) asset RWA — from GLAccount.baselRiskWeightPercent ---
  const assetAccounts = await prisma.gLAccount.findMany({
    where: { institutionId, category: "ASSET" },
    select: { balance: true, baselRiskWeightPercent: true },
  });
  let otherAssetRWA = 0, unclassifiedAssetBalance = 0;
  for (const a of assetAccounts) {
    const bal = Number(a.balance);
    if (a.baselRiskWeightPercent === null || a.baselRiskWeightPercent === undefined) {
      unclassifiedAssetBalance += bal;
      otherAssetRWA += bal * 1.0; // disclosed conservative default — 100%, see schema comment
    } else {
      otherAssetRWA += bal * (a.baselRiskWeightPercent / 100);
    }
  }

  const totalRWA = round2(loanRWA + otherAssetRWA);

  // --- Admissibility caps (CRD §73) ---
  const admittedAT1 = Math.min(rawAt1, totalRWA * (MAX_AT1_OF_RWA / 100));
  const admittedTier2 = Math.min(rawTier2, totalRWA * (MAX_TIER2_OF_RWA / 100));

  const cet1Ratio = totalRWA > 0 ? round2((rawCet1 / totalRWA) * 100) : 0;
  const tier1Ratio = totalRWA > 0 ? round2(((rawCet1 + admittedAT1) / totalRWA) * 100) : 0;
  const totalCAR = totalRWA > 0 ? round2(((rawCet1 + admittedAT1 + admittedTier2) / totalRWA) * 100) : 0;
  const nplRatio = grossLoans > 0 ? round2((nplLoans / grossLoans) * 100) : 0;

  return {
    rawCet1: round2(rawCet1), rawAt1: round2(rawAt1), rawTier2: round2(rawTier2),
    admittedAT1: round2(admittedAT1), admittedTier2: round2(admittedTier2),
    totalRWA, loanRWA: round2(loanRWA), otherAssetRWA: round2(otherAssetRWA),
    unclassifiedAssetBalance: round2(unclassifiedAssetBalance),
    cet1Ratio, tier1Ratio, totalCAR, nplRatio, grossLoans: round2(grossLoans),
    classificationCounts,
  };
}

capitalAdequacyRouter.get("/live", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const s = await computeSnapshot(req.auth!.institutionId);
  res.json({ ...s, minCet1Ratio: MIN_CET1_RATIO, minTier1Ratio: MIN_TIER1_RATIO, minCAR: MIN_CAR, ccb1: CCB1, nplCeiling: NPL_CEILING_MICROFINANCE });
});

capitalAdequacyRouter.get("/snapshots", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const snapshots = await prisma.regulatoryCapitalSnapshot.findMany({
    where: { institutionId: req.auth!.institutionId },
    orderBy: { asOfDate: "desc" },
  });
  res.json({ snapshots });
});

const createSnapshotSchema = z.object({ asOfDate: z.string() });

// Persists a point-in-time record — real audit/regulatory practice needs
// to show what CAR was on a specific reporting date without it silently
// changing if the loan book moves later.
capitalAdequacyRouter.post("/snapshots", requirePermission("institution.configure"), async (req: AuthedRequest, res) => {
  const parsed = createSnapshotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const s = await computeSnapshot(req.auth!.institutionId);

  const snapshot = await prisma.regulatoryCapitalSnapshot.create({
    data: {
      institutionId: req.auth!.institutionId,
      asOfDate: new Date(parsed.data.asOfDate),
      rawCet1Capital: s.rawCet1, rawAdditionalTier1Capital: s.rawAt1, rawTier2Capital: s.rawTier2,
      admittedAdditionalTier1Capital: s.admittedAT1, admittedTier2Capital: s.admittedTier2,
      totalRWA: s.totalRWA, loanRWA: s.loanRWA, otherAssetRWA: s.otherAssetRWA,
      unclassifiedAssetBalance: s.unclassifiedAssetBalance,
      cet1Ratio: s.cet1Ratio, tier1Ratio: s.tier1Ratio, totalCAR: s.totalCAR,
      nplRatio: s.nplRatio,
      breakdown: { classificationCounts: s.classificationCounts, grossLoans: s.grossLoans },
      computedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "regulatory_capital_snapshot.create", resource: "regulatory_capital_snapshot", resourceId: snapshot.id, metadata: { totalCAR: s.totalCAR, nplRatio: s.nplRatio } },
  });

  res.status(201).json({ snapshot });
});

// -----------------------------------------------------------------------
// Credit Concentration Risk — BOG Guidelines on Management and
// Measurement of Credit Concentration Risk, 2025 (uploaded source
// document). §B Application names Banks, Savings and Loans Companies,
// Finance Houses and FHCs; §E Proportionality explicitly says tools
// should be commensurate with an institution's scale and complexity.
// The formal Pillar II capital-add-on modeling (§39-48, PD/LGD/EAD
// multifactor models) is explicitly bank-only (§39 footnote 14) and not
// built here. What IS built: the model-free (heuristic) metrics §26
// names as legitimate on their own — HHI, Gini Coefficient, and
// concentration ratios — extending the same outstanding-loan data the
// portfolio dashboard already computes.
// -----------------------------------------------------------------------

capitalAdequacyRouter.get("/concentration", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loans = await prisma.loan.findMany({
    where: { institutionId: req.auth!.institutionId, status: { in: OUTSTANDING_LOAN_STATUSES as any } },
    select: { customerId: true, principal: true, installments: { select: { principalPaid: true } } },
  });

  const byCustomer = new Map<string, number>();
  for (const l of loans) {
    const principalPaid = l.installments.reduce((s: number, i: any) => s + Number(i.principalPaid), 0);
    const outstanding = Math.max(0, round2(Number(l.principal) - principalPaid));
    byCustomer.set(l.customerId, (byCustomer.get(l.customerId) || 0) + outstanding);
  }

  const exposures = Array.from(byCustomer.values()).filter((v) => v > 0);
  const total = exposures.reduce((s, v) => s + v, 0);

  if (total === 0 || exposures.length === 0) {
    return res.json({ hhi: 0, gini: 0, concentrationRatios: {}, exposureCount: 0, totalOutstanding: 0 });
  }

  // §26 "HHI... calculated as the sum of squares of individual exposures
  // as a percentage of total exposures." Ranges 0 (perfectly diversified)
  // to 1 (single exposure).
  const hhi = round2(exposures.reduce((s, v) => s + Math.pow(v / total, 2), 0) * 10000) / 10000;

  // §26 "Gini coefficient of zero reflects equal exposure... one reflects
  // maximum concentration" — standard Gini computation over the exposure
  // distribution (mean absolute difference / (2 × mean × n)).
  const sorted = [...exposures].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = total / n;
  let sumAbsDiff = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sumAbsDiff += Math.abs(sorted[i] - sorted[j]);
  const gini = n > 1 ? round2((sumAbsDiff / (2 * n * n * mean)) * 10000) / 10000 : 0;

  // §26 "Examples of concentration ratio include top 5, 10, 20, 25, 50, 75
  // exposures to the total... credit portfolio" — exact wording used here.
  const descSorted = [...exposures].sort((a, b) => b - a);
  const ratioAt = (topN: number) => {
    const sum = descSorted.slice(0, topN).reduce((s, v) => s + v, 0);
    return round2((sum / total) * 100);
  };
  const concentrationRatios = {
    top5: ratioAt(5), top10: ratioAt(10), top20: ratioAt(20),
    top25: ratioAt(25), top50: ratioAt(50), top75: ratioAt(75),
  };

  res.json({ hhi, gini, concentrationRatios, exposureCount: exposures.length, totalOutstanding: round2(total) });
});
