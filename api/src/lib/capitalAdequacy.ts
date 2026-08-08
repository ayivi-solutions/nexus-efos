// Bank of Ghana Capital Requirements Directive, 2018 (uploaded source
// document) — Standardised Approach risk weights, loan classification for
// past-due facilities, and the CET1/Tier1/Total CAR structure. Also Act
// 930 §29 (statutory 10% CAR floor) and the BOG Governor's 5 Aug 2026
// directive setting a 5% NPL ceiling specifically for microfinance firms
// (10% for other regulated institutions).
//
// Pure functions deliberately — no database access — same discipline as
// lib/arrears.ts, so classification/risk-weight logic can be tested
// directly against real scenarios before it's ever run against live loans.
//
// DISCLOSED GAPS — named here once, not scattered through the file:
//   - Loan classification day-count boundaries (which day counts split
//     Substandard/Doubtful/Loss within the >90-days-past-due population)
//     are NOT in the uploaded CRD — it defines "past due" as a single
//     >90-day threshold (§140) and treats "classified as substandard/
//     doubtful/loss" as an input from elsewhere (the "BOG Guide for
//     Reporting Institutions" it references in §142, which wasn't
//     supplied). The day-count boundaries below (30/90/180/365) are a
//     disclosed default matching common regional convention — the
//     provisioning PERCENTAGES themselves (25% substandard, 50%
//     doubtful, 100% loss) ARE confirmed by the CRD, as the specific-
//     provision thresholds required for preferential risk-weight
//     treatment (§142).
//   - "Qualifying retail" criteria (§128) — salaried-employee
//     verification, employer-administered repayment — can't be verified
//     from existing loan/customer data. The retail-vs-SME/corporate
//     split below is a simplified proxy (individual customer + loan
//     ≤ GHc 500,000, the one criterion that IS checkable), not a claim
//     of verified compliance with the full qualifying-retail test.
//   - Mortgage-specific past-due treatment (CRD §144-145) is not
//     applied — all past-due loans use the general unsecured treatment
//     (§142), since verifying "qualifying mortgage" status (LTV ≤80%,
//     professional valuation, insurance) isn't reliably derivable from
//     existing Collateral records.

export const MIN_CET1_RATIO = 6.5; // CRD §73(a), §75 row 1
export const CCB1 = 3.0; // CRD §75 row 2, §79-82 — CET1-only capital conservation buffer
export const MIN_TIER1_RATIO = 8.0; // CRD §73(b), §75 row 5
export const MIN_CAR = 10.0; // Act 930 §29(2) statutory floor; CRD §71/§75 row 7 — same figure
export const MAX_AT1_OF_RWA = 1.5; // CRD §73(b), §75 row 4
export const MAX_TIER2_OF_RWA = 2.0; // CRD §73(c), §75 row 6

// BOG Governor's directive, reported 5 Aug 2026: general SDI/bank NPL
// ceiling 10%, microfinance firms specifically 5%, both by Dec 2026.
export const NPL_CEILING_MICROFINANCE = 5.0;
export const NPL_CEILING_GENERAL = 10.0;

export const PAST_DUE_THRESHOLD_DAYS = 90; // CRD §140, exact

export type RegulatoryClassification = "CURRENT" | "OLEM" | "SUBSTANDARD" | "DOUBTFUL" | "LOSS";

export interface ClassificationResult {
  classification: RegulatoryClassification;
  provisionRate: number; // as a fraction, e.g. 0.25 for 25%
}

// Disclosed default day-count boundaries (see file header) — the
// provisioning rates for SUBSTANDARD/DOUBTFUL/LOSS are the CRD-confirmed
// figures (§142), CURRENT/OLEM rates are a disclosed default.
export function classifyLoanForRegulatory(daysInArrears: number): ClassificationResult {
  if (daysInArrears <= 30) return { classification: "CURRENT", provisionRate: 0.01 };
  if (daysInArrears <= PAST_DUE_THRESHOLD_DAYS) return { classification: "OLEM", provisionRate: 0.10 };
  if (daysInArrears <= 180) return { classification: "SUBSTANDARD", provisionRate: 0.25 }; // CRD §142(b)
  if (daysInArrears <= 365) return { classification: "DOUBTFUL", provisionRate: 0.50 }; // CRD §142(c)
  return { classification: "LOSS", provisionRate: 1.00 }; // CRD §142(d), fully provisioned by construction
}

export interface LoanForRiskWeight {
  outstanding: number;
  daysInArrears: number;
  customerSegment: string; // Customer.segment
}

const RETAIL_MAX_EXPOSURE = 500_000; // CRD §128(d), exact — GHc 500,000

// CRD §128 (retail, qualifying-proxy), §138 (corporates), §139 (SMEs),
// §142 (past-due, unsecured treatment — see file header for the
// mortgage-treatment gap).
export function loanRiskWeightPercent(loan: LoanForRiskWeight): number {
  if (loan.daysInArrears > PAST_DUE_THRESHOLD_DAYS) {
    const { classification } = classifyLoanForRegulatory(loan.daysInArrears);
    if (classification === "SUBSTANDARD") return 150; // §142(b) — provision 25% meets the "no less than 25%" test by construction
    if (classification === "DOUBTFUL") return 100; // §142(c) — provision 50% meets the "no less than 50%" test by construction
    return 0; // LOSS, always fully provisioned (100%) in this model — §142(d)
  }
  const isRetailProxy = loan.customerSegment === "INDIVIDUAL" && loan.outstanding <= RETAIL_MAX_EXPOSURE;
  return isRetailProxy ? 75 : 100; // §128 vs §138/§139
}
