import { round2 } from "./payrollCalc";

// doc §192 Asset Depreciation Management. Two real methods, both
// respecting the residual value floor — an asset never depreciates
// below what it was set to always retain, in either method.
export interface DepreciationInput {
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method: "STRAIGHT_LINE" | "REDUCING_BALANCE";
  annualRate?: number; // required for REDUCING_BALANCE, percentage e.g. 20 for 20%/year
  accumulatedDepreciationSoFar: number; // before this period
  monthsElapsed: number; // how many periods have already been posted, before this one
}

// Reducing-balance depreciation, by its own arithmetic, asymptotically
// approaches the residual value and never exactly reaches it within a
// finite useful life — a genuine, well-known characteristic of the
// method, not a bug. Standard practice (and what's implemented here) is
// a final-period true-up: on the asset's last scheduled month, whatever
// remains to reach the residual value is depreciated in full, so the
// asset genuinely reaches its residual value by the end of its useful
// life under either method.
export function calculateMonthlyDepreciation(input: DepreciationInput): number {
  const depreciableBase = input.acquisitionCost - input.residualValue;
  const currentNetBookValue = input.acquisitionCost - input.accumulatedDepreciationSoFar;
  const remainingDepreciable = currentNetBookValue - input.residualValue;

  if (remainingDepreciable <= 0) return 0; // fully depreciated already — never go below residual value

  const isFinalPeriod = input.monthsElapsed + 1 >= input.usefulLifeMonths;
  if (isFinalPeriod) return round2(remainingDepreciable);

  let amount: number;
  if (input.method === "STRAIGHT_LINE") {
    amount = depreciableBase / input.usefulLifeMonths;
  } else {
    const monthlyRate = (input.annualRate || 0) / 100 / 12;
    amount = currentNetBookValue * monthlyRate;
  }

  // Never depreciate past the residual value floor, regardless of method.
  return round2(Math.min(amount, remainingDepreciable));
}
