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
