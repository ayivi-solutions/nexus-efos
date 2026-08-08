// Nexus EFOS EAIS §127.5 Agent and Collector Fraud — "AI may identify
// unusual cash collection, mobile or field-agent transactions, delayed
// remittance, receipt irregularity, location or route inconsistency,
// customer complaint clusters and repeated reversals. Models shall
// account for offline operation, network delay, rural travel, shared
// equipment and legitimate bulk activity. Suspicion shall trigger
// reconciliation and investigation rather than automatic accusation or
// wage deduction."
//
// Deliberately does NOT include a transaction-timing/off-hours signal —
// the EAIS's own caution about "rural travel, offline operation" applies
// directly: field collectors legitimately work irregular hours, and a
// naive off-hours flag would produce more noise than signal. Three
// signals actually grounded in real, already-tracked data instead:
// reversal rate against the institutional baseline, settlement variance
// pattern (CollectionSettlement — the real "delayed remittance /
// receipt irregularity" data), and complaint volume from customers
// currently on the collector's own routes. Transparent disclosed-weight
// scoring, same discipline as delinquencyRisk.ts and creditAssessment.ts
// — an indicator for investigation, never an accusation, exactly as
// §127.10's acceptance criteria require ("fraud indicators are not
// represented as proof of criminal conduct").

export interface CollectorIntegrityInput {
  collectorTransactionCount: number;
  collectorReversalCount: number;
  institutionalReversalRate: number; // 0-1, computed across all collectors for the same period
  settlementCount: number;
  varianceSettlementCount: number; // non-zero-variance settlements in the period
  totalVarianceAmount: number; // sum of absolute variance across the period
  totalSettledAmount: number; // sum of expectedAmount across the period, for scale
  complaintCount: number; // complaints from customers currently on this collector's routes, in the period
}

export interface IntegrityFactor {
  factor: string;
  points: number;
}

export interface CollectorIntegrityResult {
  collectorReversalRate: number;
  varianceRate: number; // totalVarianceAmount / totalSettledAmount
  score: number; // 0-100, higher = more worth investigating
  band: "NORMAL" | "WATCH" | "INVESTIGATE";
  breakdown: IntegrityFactor[];
  // Low activity means the rates above are statistically unreliable —
  // disclosed rather than presenting a confident score off 2 transactions.
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function assessCollectorIntegrity(input: CollectorIntegrityInput): CollectorIntegrityResult {
  const collectorReversalRate = input.collectorTransactionCount > 0 ? round3(input.collectorReversalCount / input.collectorTransactionCount) : 0;
  const varianceRate = input.totalSettledAmount > 0 ? round3(input.totalVarianceAmount / input.totalSettledAmount) : 0;

  const breakdown: IntegrityFactor[] = [];

  // Reversal rate relative to the institutional baseline, not an
  // absolute threshold — what counts as "unusual" depends on how this
  // institution's collectors normally behave, not a guessed constant.
  if (input.institutionalReversalRate > 0) {
    const ratio = collectorReversalRate / input.institutionalReversalRate;
    if (ratio >= 3) breakdown.push({ factor: "Reversal rate 3x or more above the institutional average", points: 30 });
    else if (ratio >= 2) breakdown.push({ factor: "Reversal rate 2-3x the institutional average", points: 15 });
  } else if (collectorReversalRate > 0.1) {
    breakdown.push({ factor: "Reversal rate above 10% (no institutional baseline yet to compare against)", points: 15 });
  }

  if (input.varianceSettlementCount > 0 && input.settlementCount > 0) {
    const varianceSettlementRatio = input.varianceSettlementCount / input.settlementCount;
    if (varianceSettlementRatio >= 0.5) breakdown.push({ factor: "Half or more of settlements in the period had a variance", points: 25 });
    else if (varianceSettlementRatio >= 0.25) breakdown.push({ factor: "A quarter or more of settlements in the period had a variance", points: 12 });
  }

  if (varianceRate >= 0.02) breakdown.push({ factor: "Cumulative variance 2% or more of total settled amount", points: 20 });
  else if (varianceRate >= 0.01) breakdown.push({ factor: "Cumulative variance 1-2% of total settled amount", points: 10 });

  if (input.complaintCount >= 3) breakdown.push({ factor: "3 or more complaints from customers on this collector's routes in the period", points: 25 });
  else if (input.complaintCount >= 1) breakdown.push({ factor: "1-2 complaints from customers on this collector's routes in the period", points: 10 });

  const score = Math.min(100, breakdown.reduce((s, f) => s + f.points, 0));
  const band: CollectorIntegrityResult["band"] = score >= 50 ? "INVESTIGATE" : score >= 20 ? "WATCH" : "NORMAL";

  const confidence: CollectorIntegrityResult["confidence"] =
    input.collectorTransactionCount >= 20 && input.settlementCount >= 5 ? "HIGH" : input.collectorTransactionCount >= 5 ? "MEDIUM" : "LOW";

  return { collectorReversalRate, varianceRate, score, band, breakdown, confidence };
}
