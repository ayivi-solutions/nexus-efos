// doc §77 Loan Arrears Management. A pure function deliberately — takes
// installment state and today's date in, returns a classification out,
// with no database access — so it can be tested directly against real
// scenarios before it's ever run by the scheduler against live loans.

export type ArrearsClassification = "CURRENT" | "ARREARS_1_30" | "ARREARS_31_60" | "ARREARS_61_90" | "ARREARS_90_PLUS";

export interface ArrearsInstallment {
  dueDate: Date;
  totalDue: number;
  principalPaid: number;
  interestPaid: number;
}

export interface ArrearsResult {
  daysInArrears: number;
  arrearsAmount: number;
  classification: ArrearsClassification;
}

function classify(days: number): ArrearsClassification {
  if (days <= 0) return "CURRENT";
  if (days <= 30) return "ARREARS_1_30";
  if (days <= 60) return "ARREARS_31_60";
  if (days <= 90) return "ARREARS_61_90";
  return "ARREARS_90_PLUS";
}

export function calculateArrears(installments: ArrearsInstallment[], asOf: Date): ArrearsResult {
  const overdue = installments.filter((i) => {
    const paid = i.principalPaid + i.interestPaid;
    return i.dueDate < asOf && paid < i.totalDue - 0.01;
  });

  if (overdue.length === 0) {
    return { daysInArrears: 0, arrearsAmount: 0, classification: "CURRENT" };
  }

  const oldestDue = overdue.reduce((min, i) => (i.dueDate < min ? i.dueDate : min), overdue[0].dueDate);
  const daysInArrears = Math.floor((asOf.getTime() - oldestDue.getTime()) / (1000 * 60 * 60 * 24));

  const arrearsAmount = overdue.reduce((sum, i) => {
    const outstanding = i.totalDue - i.principalPaid - i.interestPaid;
    return sum + Math.max(0, outstanding);
  }, 0);

  return { daysInArrears, arrearsAmount: Math.round(arrearsAmount * 100) / 100, classification: classify(daysInArrears) };
}
