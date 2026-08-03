// doc §64 Credit Assessment — a transparent, weighted scoring model built
// from standard microfinance underwriting factors (debt-to-income,
// repayment capacity after the new loan, customer risk rating, existing
// arrears). §64.4 requires recommendations to "remain auditable" — taken
// literally: every point deducted is named and stored (score_breakdown),
// not just a final number nobody can explain later. A pure function,
// deliberately, so it's tested before it ever runs against a real loan.

export interface CreditAssessmentInput {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoanObligations: number;
  proposedInstallment: number;
  customerRiskRating: "LOW" | "MEDIUM" | "HIGH" | null;
  hasLoansInArrears: boolean;
}

export interface ScoreFactor {
  factor: string;
  points: number;
}

export interface CreditAssessmentResult {
  debtToIncomeRatio: number;
  repaymentCapacityRatio: number;
  riskScore: number;
  scoreBreakdown: ScoreFactor[];
  recommendation: "APPROVE" | "REVIEW" | "DECLINE";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function assessCredit(input: CreditAssessmentInput): CreditAssessmentResult {
  const debtToIncomeRatio = input.monthlyIncome > 0 ? round2((input.existingLoanObligations / input.monthlyIncome) * 100) : 100;
  const repaymentCapacityRatio =
    input.monthlyIncome > 0
      ? round2(((input.existingLoanObligations + input.proposedInstallment) / input.monthlyIncome) * 100)
      : 100;

  const breakdown: ScoreFactor[] = [{ factor: "Starting score", points: 100 }];

  if (debtToIncomeRatio >= 50) breakdown.push({ factor: "Debt-to-income ratio 50% or above", points: -30 });
  else if (debtToIncomeRatio >= 30) breakdown.push({ factor: "Debt-to-income ratio 30-49%", points: -15 });

  if (repaymentCapacityRatio >= 60) breakdown.push({ factor: "Repayment capacity ratio 60% or above (new loan may not be affordable)", points: -35 });
  else if (repaymentCapacityRatio >= 40) breakdown.push({ factor: "Repayment capacity ratio 40-59%", points: -15 });

  if (input.customerRiskRating === "HIGH") breakdown.push({ factor: "Customer risk rating: HIGH", points: -20 });
  else if (input.customerRiskRating === "MEDIUM") breakdown.push({ factor: "Customer risk rating: MEDIUM", points: -10 });

  if (input.hasLoansInArrears) breakdown.push({ factor: "Customer has another loan currently in arrears", points: -25 });

  const riskScore = Math.max(0, breakdown.reduce((sum, f) => sum + f.points, 0));

  // Two factors are treated as review-forcing caps, not just point
  // deductions an otherwise-clean profile can outweigh: an existing loan
  // already in arrears, and an institutional HIGH risk rating already
  // assigned to this customer for reasons beyond current financials.
  // Neither should be able to auto-clear to APPROVE no matter how good
  // the raw numbers look — a human needs to look at these specifically.
  const forcesReview = input.hasLoansInArrears || input.customerRiskRating === "HIGH";

  let recommendation: CreditAssessmentResult["recommendation"];
  if (riskScore < 40) recommendation = "DECLINE";
  else if (riskScore >= 70 && !forcesReview) recommendation = "APPROVE";
  else recommendation = "REVIEW";

  return { debtToIncomeRatio, repaymentCapacityRatio, riskScore, scoreBreakdown: breakdown, recommendation };
}
