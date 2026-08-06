import { round2 } from "./payrollCalc";

// doc BOG Financial Publication Guide — the previously-named Cash Flow
// Statement gap, closed here. Indirect method: for a debit-normal
// account (ASSET/EXPENSE), an increase in balance is a cash use
// (negative); for a credit-normal account (LIABILITY/EQUITY/INCOME), an
// increase is a cash source (positive) — the exact opposite sign of how
// the account affects its own balance, which is what makes cash flow
// from a balance sheet movement in the first place. This isn't a
// separate methodology from the double-entry engine already built
// elsewhere in this platform; it's a direct consequence of it.
export interface CashFlowAccountMovement {
  accountId: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  activity: "OPERATING" | "INVESTING" | "FINANCING" | null;
  isLiquidAsset: boolean;
  openingBalance: number;
  closingBalance: number;
}

function cashEffect(category: string, change: number): number {
  const isDebitNormal = category === "ASSET" || category === "EXPENSE";
  return isDebitNormal ? -change : change;
}

export function buildCashFlowStatement(movements: CashFlowAccountMovement[]) {
  const nonCash = movements.filter((m) => !m.isLiquidAsset);

  let operating = 0, investing = 0, financing = 0;
  for (const m of nonCash) {
    const change = round2(m.closingBalance - m.openingBalance);
    const effect = cashEffect(m.category, change);
    if (m.activity === "INVESTING") investing += effect;
    else if (m.activity === "FINANCING") financing += effect;
    else operating += effect; // untagged accounts default to operating, the conventional treatment for working-capital movements
  }

  const cashAccounts = movements.filter((m) => m.isLiquidAsset);
  const cashOpening = round2(cashAccounts.reduce((s, m) => s + m.openingBalance, 0));
  const cashClosing = round2(cashAccounts.reduce((s, m) => s + m.closingBalance, 0));
  const netChange = round2(operating + investing + financing);

  return {
    operating: round2(operating), investing: round2(investing), financing: round2(financing),
    netChange, cashOpening, cashClosing,
    reconciles: Math.abs(round2(cashClosing - cashOpening) - netChange) < 0.02,
  };
}
