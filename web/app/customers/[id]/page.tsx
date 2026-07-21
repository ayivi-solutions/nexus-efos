"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

type TimelineEvent = {
  date: string;
  label: string;
  detail: string;
  amount?: string;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [customer, setCustomer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCustomer(id).then((res) => setCustomer(res.customer)).catch((err) => setError(err.message));
  }, [id]);

  const events: TimelineEvent[] = [];
  if (customer) {
    for (const loan of customer.loans || []) {
      events.push({
        date: loan.createdAt,
        label: "Loan initiated",
        detail: `${loan.status} · GHS ${Number(loan.principal).toLocaleString()} at ${loan.interestRate}% over ${loan.termMonths}mo`,
      });
      if (loan.disbursedAt) {
        events.push({ date: loan.disbursedAt, label: "Loan disbursed", detail: `GHS ${Number(loan.principal).toLocaleString()}` });
      }
      for (const r of loan.repayments || []) {
        events.push({ date: r.paidAt, label: "Loan repayment", detail: "Recorded against loan", amount: `+GHS ${Number(r.amount).toLocaleString()}` });
      }
    }
    for (const acct of customer.savingsAccounts || []) {
      events.push({ date: acct.createdAt, label: "Savings account opened", detail: acct.accountNumber });
      for (const t of acct.transactions || []) {
        events.push({
          date: t.createdAt,
          label: t.type === "DEPOSIT" ? "Savings deposit" : "Savings withdrawal",
          detail: `${acct.accountNumber} · balance after GHS ${Number(t.balanceAfter).toLocaleString()}`,
          amount: `${t.type === "DEPOSIT" ? "+" : "-"}GHS ${Number(t.amount).toLocaleString()}`,
        });
      }
    }
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return (
    <AppShell active="Customers">
      <div className="p-5 dt:p-10 overflow-x-auto">
        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
        {!customer && !error && <p className="text-text-muted text-sm">Loading…</p>}

        {customer && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {customer.segment.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">{customer.fullName}</h1>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <Stat label="Phone" value={customer.phone} />
              <Stat label="Stage" value={customer.lifecycleStage.replaceAll("_", " ")} />
              <Stat label="KYC" value={customer.kycStatus} />
              <Stat label="Loans" value={String((customer.loans || []).length)} />
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">History</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead>
                  <tr><th>Date</th><th>Event</th><th>Detail</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td className="text-text-700 whitespace-nowrap">{new Date(e.date).toLocaleString()}</td>
                      <td className="text-text-900 font-medium">{e.label}</td>
                      <td className="text-text-700">{e.detail}</td>
                      <td className={`font-mono text-[12.5px] ${e.amount?.startsWith("+") ? "text-green-600" : e.amount?.startsWith("-") ? "text-rose-600" : "text-text-muted"}`}>
                        {e.amount || "—"}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No activity yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-50 border border-paper-100 rounded-md p-3.5">
      <div className="font-display font-semibold text-xl text-gold-600">{value}</div>
      <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
