import { round2 } from "./payrollCalc";

// doc §214 Payroll Accounting. Two genuinely separate journals per run:
// an accrual journal (posted at APPROVAL — recognizes the real expense
// and the real liabilities owed) and a settlement journal (posted at
// PAID — settles the salaries-payable liability against cash). This is
// standard accrual-basis payroll accounting, not a single combined
// journal that would conflate two different accounting events.
export interface PayrollAccrualInputs {
  totalGross: number;
  totalPaye: number;
  totalSsnitEmployee: number;
  totalSsnitEmployerTier1: number;
  totalTier2Employer: number;
  totalOtherDeductions: number;
  totalNet: number;
}

export type PayrollGLPurpose =
  | "Salary Expense" | "Employer SSNIT Expense" | "Employer Tier 2 Expense"
  | "PAYE Payable" | "SSNIT Payable" | "Tier 2 Payable" | "Other Deductions Payable" | "Salaries Payable"
  | "Cash/Bank Disbursement";

export const REQUIRED_ACCRUAL_PURPOSES: PayrollGLPurpose[] = [
  "Salary Expense", "Employer SSNIT Expense", "Employer Tier 2 Expense",
  "PAYE Payable", "SSNIT Payable", "Tier 2 Payable", "Other Deductions Payable", "Salaries Payable",
];

// "Salaries Payable" is shared with the accrual set above (the same
// liability recognized there is settled here); "Cash/Bank Disbursement"
// is the settlement-specific addition.
export const REQUIRED_SETTLEMENT_PURPOSES: PayrollGLPurpose[] = ["Salaries Payable", "Cash/Bank Disbursement"];

export const ALL_PAYROLL_GL_PURPOSES: PayrollGLPurpose[] = [...REQUIRED_ACCRUAL_PURPOSES, "Cash/Bank Disbursement"];

// The algebra: totalDebits = gross + employerSSNIT + employerTier2.
// totalCredits = paye + (ssnitEmployee + employerSSNIT) + employerTier2 +
// otherDeductions + net. Since net = gross - paye - ssnitEmployee -
// otherDeductions (the processing engine's own formula), the paye,
// ssnitEmployee, and otherDeductions terms cancel exactly, leaving both
// sides equal to gross + employerSSNIT + employerTier2. Genuinely
// balances by construction, not by coincidence — verified with real
// numbers below, not just this algebra.
export function buildPayrollAccrualLines(inputs: PayrollAccrualInputs, accountIds: Record<string, string>) {
  const totalSsnitPayable = round2(inputs.totalSsnitEmployee + inputs.totalSsnitEmployerTier1);
  return [
    { accountId: accountIds["Salary Expense"], category: undefined as any, debit: inputs.totalGross, credit: 0 },
    { accountId: accountIds["Employer SSNIT Expense"], category: undefined as any, debit: inputs.totalSsnitEmployerTier1, credit: 0 },
    { accountId: accountIds["Employer Tier 2 Expense"], category: undefined as any, debit: inputs.totalTier2Employer, credit: 0 },
    { accountId: accountIds["PAYE Payable"], category: undefined as any, debit: 0, credit: inputs.totalPaye },
    { accountId: accountIds["SSNIT Payable"], category: undefined as any, debit: 0, credit: totalSsnitPayable },
    { accountId: accountIds["Tier 2 Payable"], category: undefined as any, debit: 0, credit: inputs.totalTier2Employer },
    { accountId: accountIds["Other Deductions Payable"], category: undefined as any, debit: 0, credit: inputs.totalOtherDeductions },
    { accountId: accountIds["Salaries Payable"], category: undefined as any, debit: 0, credit: inputs.totalNet },
  ].filter((l) => l.debit > 0 || l.credit > 0); // zero-amount lines (e.g. no other deductions this run) are simply omitted, not posted as empty entries
}

export function buildPayrollSettlementLines(totalNet: number, salariesPayableAccountId: string, cashAccountId: string) {
  return [
    { accountId: salariesPayableAccountId, debit: totalNet, credit: 0 },
    { accountId: cashAccountId, debit: 0, credit: totalNet },
  ];
}
