// Nexus EFOS EAIS §129.1 Delinquency Prediction — "may estimate the
// likelihood and timing of missed payment to support early, proportionate
// assistance... A prediction shall not alter arrears status, apply fees,
// accelerate a loan or initiate enforcement. The Loan and Accounting
// Domains shall provide authoritative status and amounts."
//
// Genuinely distinct from the existing reactive arrears system
// (lib/arrears.ts, daysInArrears/arrearsClassification): that system
// tells you a loan IS late. This estimates whether a loan that's still
// CURRENT is showing early signs of trouble before it becomes late —
// the actual "early warning" the EAIS asks for.
//
// Transparent, disclosed-weight scoring (same discipline as
// lib/creditAssessment.ts and lib/customerRiskScoring.ts), not a
// trained ML model — this platform doesn't have the historical outcome
// volume yet for real model training/validation, and building something
// that looks like ML without the validation infrastructure the EAIS
// itself requires (§077-079 Model Evaluation/Validation/Approval) would
// be dishonest about what it actually is. Advisory Mode only (EAIS
// §017.3): this informs collections prioritisation, it does not alter
// arrears status, apply fees, or take any action on its own.

export interface DelinquencyRiskInput {
  // Cumulative amount due across all installments with dueDate <= asOf,
  // and cumulative amount actually paid (from LoanRepayment) by asOf —
  // the real leading indicator: is the payment buffer shrinking even
  // though the loan is technically still current?
  cumulativeDue: number;
  cumulativePaid: number;
  daysSinceLastRepayment: number | null; // null = no repayment yet
  typicalInstallmentIntervalDays: number; // derived from the loan's own schedule
  installmentsSoFar: number; // how many installments have reached their due date
  customerRiskRating: "LOW" | "MEDIUM" | "HIGH" | null;
  hasOtherLoansInArrears: boolean;
}

export interface DelinquencyRiskFactor {
  factor: string;
  points: number;
}

export interface DelinquencyRiskResult {
  bufferRatio: number; // (cumulativePaid - cumulativeDue) / cumulativeDue — negative means already behind on cumulative terms
  riskScore: number; // 0-100, higher = more concerning
  riskBand: "LOW" | "WATCH" | "ELEVATED" | "HIGH";
  breakdown: DelinquencyRiskFactor[];
  // Early-stage loans (few installments so far) have less history to
  // judge — disclosed explicitly rather than presenting a confident
  // score on a two-week-old loan.
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function assessDelinquencyRisk(input: DelinquencyRiskInput): DelinquencyRiskResult {
  const bufferRatio = input.cumulativeDue > 0 ? round2((input.cumulativePaid - input.cumulativeDue) / input.cumulativeDue) : 0;

  const breakdown: DelinquencyRiskFactor[] = [];

  // The core leading signal: cumulative payments falling behind
  // cumulative dues, even while the loan is still technically current
  // (e.g. paid just enough to avoid the next installment being overdue,
  // but the buffer that used to exist is eroding).
  if (bufferRatio < -0.1) breakdown.push({ factor: "Cumulative payments more than 10% behind cumulative dues", points: 35 });
  else if (bufferRatio < 0) breakdown.push({ factor: "Cumulative payments trailing cumulative dues", points: 20 });
  else if (bufferRatio < 0.05) breakdown.push({ factor: "Payment buffer thin (within 5% of cumulative dues)", points: 10 });

  // Gap since last repayment, relative to the loan's own expected cadence.
  if (input.daysSinceLastRepayment === null && input.installmentsSoFar > 0) {
    breakdown.push({ factor: "No repayment recorded yet despite installment(s) due", points: 30 });
  } else if (input.daysSinceLastRepayment !== null && input.typicalInstallmentIntervalDays > 0) {
    const ratio = input.daysSinceLastRepayment / input.typicalInstallmentIntervalDays;
    if (ratio >= 1.5) breakdown.push({ factor: "Time since last repayment exceeds 1.5x the typical installment interval", points: 25 });
    else if (ratio >= 1.1) breakdown.push({ factor: "Time since last repayment slightly exceeds the typical installment interval", points: 10 });
  }

  if (input.customerRiskRating === "HIGH") breakdown.push({ factor: "Customer risk rating: HIGH", points: 15 });
  else if (input.customerRiskRating === "MEDIUM") breakdown.push({ factor: "Customer risk rating: MEDIUM", points: 5 });

  if (input.hasOtherLoansInArrears) breakdown.push({ factor: "Customer has another loan currently in arrears", points: 20 });

  const riskScore = Math.min(100, breakdown.reduce((s, f) => s + f.points, 0));
  const riskBand: DelinquencyRiskResult["riskBand"] =
    riskScore >= 60 ? "HIGH" : riskScore >= 35 ? "ELEVATED" : riskScore >= 15 ? "WATCH" : "LOW";

  // Confidence is explicitly lower for young loans — not enough payment
  // history yet to trust a buffer trend or interval comparison.
  const confidence: DelinquencyRiskResult["confidence"] =
    input.installmentsSoFar >= 3 ? "HIGH" : input.installmentsSoFar >= 1 ? "MEDIUM" : "LOW";

  return { bufferRatio, riskScore, riskBand, breakdown, confidence };
}
