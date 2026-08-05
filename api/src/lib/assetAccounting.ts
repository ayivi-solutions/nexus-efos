import { round2 } from "./payrollCalc";

// doc §188.2/§192.2/§193.2 "Accounting Entries" — the three real GL
// integration points for Asset Management, using the exact same
// name-matched, configurable GL mapping pattern already proven for
// Payroll (§214).
export type AssetGLPurpose =
  | "Fixed Asset" | "Depreciation Expense" | "Accumulated Depreciation"
  | "Cash/Bank (Acquisition)" | "Cash/Bank (Disposal Proceeds)" | "Gain on Disposal" | "Loss on Disposal";

// Acquisition: Dr Fixed Asset / Cr Cash. Genuinely balances by
// construction — the same number on both sides.
export function buildAssetAcquisitionLines(cost: number, fixedAssetAccountId: string, cashAccountId: string) {
  return [
    { accountId: fixedAssetAccountId, debit: cost, credit: 0 },
    { accountId: cashAccountId, debit: 0, credit: cost },
  ];
}

// Depreciation: Dr Depreciation Expense / Cr Accumulated Depreciation.
export function buildAssetDepreciationLines(amount: number, expenseAccountId: string, accumulatedDepreciationAccountId: string) {
  return [
    { accountId: expenseAccountId, debit: amount, credit: 0 },
    { accountId: accumulatedDepreciationAccountId, debit: 0, credit: amount },
  ];
}

// Disposal: remove the asset at cost and its accumulated depreciation,
// receive any sale proceeds in cash, and recognize the gain or loss —
// whichever side of the equation the gain/loss lands on to keep it
// genuinely balanced, not a fixed assumption of "gain" or "loss".
//
// Dr Accumulated Depreciation (removing it)
// Dr Cash (if any proceeds received)
// Dr Loss on Disposal (if netBookValue > proceeds)
// = Cr Fixed Asset (removing it at original cost)
// = Cr Gain on Disposal (if proceeds > netBookValue)
export function buildAssetDisposalLines(
  acquisitionCost: number,
  accumulatedDepreciation: number,
  saleProceeds: number,
  accountIds: Record<string, string>,
) {
  const netBookValue = round2(acquisitionCost - accumulatedDepreciation);
  const gainLoss = round2(saleProceeds - netBookValue);

  const lines = [
    { accountId: accountIds["Accumulated Depreciation"], debit: accumulatedDepreciation, credit: 0 },
    { accountId: accountIds["Fixed Asset"], debit: 0, credit: acquisitionCost },
  ];
  if (saleProceeds > 0) {
    lines.push({ accountId: accountIds["Cash/Bank (Disposal Proceeds)"], debit: saleProceeds, credit: 0 });
  }
  if (gainLoss > 0) {
    lines.push({ accountId: accountIds["Gain on Disposal"], debit: 0, credit: gainLoss });
  } else if (gainLoss < 0) {
    lines.push({ accountId: accountIds["Loss on Disposal"], debit: -gainLoss, credit: 0 });
  }
  return lines.filter((l) => l.debit > 0 || l.credit > 0);
}
