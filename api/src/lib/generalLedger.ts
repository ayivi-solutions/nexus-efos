// doc §118.3 "Debits equal credits" and standard double-entry accounting
// rules. Pure functions, tested before they ever touch a route — this is
// the part of the whole platform where a subtle bug would be worst.

export interface JournalLineInput {
  accountId: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  debit: number;
  credit: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// §118.3 "Debits equal credits" — the fundamental double-entry rule,
// checked before any journal is allowed to post.
export function isBalanced(lines: { debit: number; credit: number }[]): boolean {
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return totalDebit === totalCredit && totalDebit > 0;
}

// Standard accounting convention: Assets and Expenses have a normal DEBIT
// balance (a debit increases them); Liabilities, Equity, and Income have
// a normal CREDIT balance (a credit increases them). Getting this
// backwards for even one category would silently corrupt every account
// of that type.
export function balanceEffect(category: JournalLineInput["category"], debit: number, credit: number): number {
  const isDebitNormal = category === "ASSET" || category === "EXPENSE";
  return isDebitNormal ? round2(debit - credit) : round2(credit - debit);
}

export function generateJournalNumber(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "JN" + Date.now().toString().slice(-10) + rand;
}

// doc §120.3 "Closed periods prevent unauthorised postings" — a single
// shared lookup, used both at journal creation and again at posting
// approval time, so there is exactly one place that decides "is this
// date postable," not two implementations that could drift apart.
export async function findPostablePeriod(prisma: any, institutionId: string, date: Date): Promise<{ id: string; status: string } | null> {
  const period = await prisma.financialPeriod.findFirst({
    where: { institutionId, startDate: { lte: date }, endDate: { gte: date } },
  });
  return period;
}

// doc §123 Financial Statement Management. A shared aggregation core used
// by Trial Balance, the Balance Sheet, the Income Statement, and the
// Statement of Changes in Equity — one place that decides "what is this
// account's balance," not four separate reimplementations that could
// silently diverge. The pure aggregation logic is tested before the
// database-querying wrapper around it is ever used.
export interface LedgerLineForAggregation {
  accountId: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  debit: number;
  credit: number;
}

// A balance sheet is a cumulative snapshot since inception — every posted
// line up to and including the as-of date contributes.
export function aggregateBalancesAsOf(lines: LedgerLineForAggregation[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of lines) {
    const effect = balanceEffect(line.category, line.debit, line.credit);
    result.set(line.accountId, round2((result.get(line.accountId) || 0) + effect));
  }
  return result;
}

// An income statement covers a single period only — Income/Expense
// accounts conceptually reset each period, so this is the exact same
// aggregation logic, just fed lines already pre-filtered to the period's
// date range rather than everything since inception. Same function,
// different input — not a second implementation.
export const aggregateBalancesForPeriod = aggregateBalancesAsOf;

// doc §125.2 "Financial Forecasting" — a genuine, disclosed technique:
// simple linear regression (least squares) over recent historical
// periods, projecting forward. This is NOT machine learning and isn't
// presented as such — it's an honest, transparent trend line, clearly
// labeled wherever it's shown, standing in until the AI spec lands and a
// real predictive model can be layered on top of the same underlying
// data this produces.
export function linearTrendForecast(values: number[]): { slope: number; intercept: number; nextValue: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, nextValue: values[0] || 0 };
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = values.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const nextValue = round2(slope * n + intercept);
  return { slope: round2(slope), intercept: round2(intercept), nextValue };
}
