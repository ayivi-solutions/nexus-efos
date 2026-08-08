// Single source of truth for "outstanding loan balance" and PAR, used by
// both the Portfolio Analytics dashboard and the Loans Report. Extracted
// after finding a real inconsistency: the Loans Report was independently
// computing PAR from raw `principal` (the original loan amount, not
// actual outstanding balance) and inferring "at risk" from arrears-bucket
// labels rather than the daysInArrears threshold directly — the two
// views could show different PAR numbers for the same institution at the
// same moment. One calculation now, imported everywhere it's needed.
import { prisma } from "./prisma";
import { round2 } from "./generalLedger";

export const OUTSTANDING_LOAN_STATUSES = ["DISBURSED", "ACTIVE", "DEFAULTED"];

export interface OutstandingLoan {
  id: string;
  principal: unknown;
  branchId: string | null;
  productVersionId: string | null;
  customerId: string;
  arrearsClassification: string;
  daysInArrears: number;
  outstanding: number;
}

export async function outstandingLoansWithBalance(institutionId: string): Promise<OutstandingLoan[]> {
  const loans = await prisma.loan.findMany({
    where: { institutionId, status: { in: OUTSTANDING_LOAN_STATUSES as any } },
    select: {
      id: true, principal: true, branchId: true, productVersionId: true, customerId: true,
      arrearsClassification: true, daysInArrears: true,
      installments: { select: { principalPaid: true } },
    },
  });
  return loans.map((l: any) => {
    const principalPaid = l.installments.reduce((s: number, i: any) => s + Number(i.principalPaid), 0);
    const outstanding = Math.max(0, round2(Number(l.principal) - principalPaid));
    return { ...l, outstanding };
  });
}

export function parRatio(loans: OutstandingLoan[], thresholdDays: number) {
  const total = loans.reduce((s: number, l: OutstandingLoan) => s + l.outstanding, 0);
  if (total === 0) return 0;
  const atRisk = loans.filter((l: OutstandingLoan) => l.daysInArrears > thresholdDays).reduce((s: number, l: OutstandingLoan) => s + l.outstanding, 0);
  return round2((atRisk / total) * 100);
}
