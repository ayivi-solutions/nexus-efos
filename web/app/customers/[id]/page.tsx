"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

const STAGES = ["AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT"];
const KYC_STATUSES = ["PENDING", "VERIFIED", "REJECTED"];

type TimelineEvent = { date: string; label: string; detail: string; amount?: string };

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [customer, setCustomer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.getCustomer(id).then((res) => setCustomer(res.customer)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStageChange(lifecycleStage: string) {
    setBusy(true);
    setError(null);
    try {
      await api.updateCustomerStage(id, lifecycleStage);
      load();
    } catch (err: any) {
      setError(err.message || "Could not update stage");
    } finally {
      setBusy(false);
    }
  }

  async function handleKycChange(kycStatus: string) {
    setBusy(true);
    setError(null);
    try {
      await api.updateCustomerKyc(id, kycStatus);
      load();
    } catch (err: any) {
      setError(err.message || "Could not update KYC status");
    } finally {
      setBusy(false);
    }
  }

  const events: TimelineEvent[] = [];
  if (customer) {
    for (const loan of customer.loans || []) {
      events.push({ date: loan.createdAt, label: "Loan initiated", detail: `${loan.status} · GHS ${Number(loan.principal).toLocaleString()} at ${loan.interestRate}% over ${loan.termMonths}mo` });
      if (loan.disbursedAt) events.push({ date: loan.disbursedAt, label: "Loan disbursed", detail: `GHS ${Number(loan.principal).toLocaleString()}` });
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
        <button onClick={() => router.push("/customers")} className="text-[13px] text-text-muted hover:text-text-700 mb-4">← Back to Customers</button>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
        {!customer && !error && <p className="text-text-muted text-sm">Loading…</p>}

        {customer && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {customer.segment.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">{customer.fullName}</h1>
            <div className="text-text-muted text-sm mb-6">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</div>

            <div className="card p-6 mb-8">
              <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Lifecycle &amp; KYC</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Lifecycle stage</span>
                  <select disabled={busy} className="input" value={customer.lifecycleStage} onChange={(e) => handleStageChange(e.target.value)}>
                    {STAGES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">KYC status</span>
                  <select disabled={busy} className="input" value={customer.kycStatus} onChange={(e) => handleKycChange(e.target.value)}>
                    {KYC_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
              <Stat label="Loans" value={String((customer.loans || []).length)} />
              <Stat label="Savings accounts" value={String((customer.savingsAccounts || []).length)} />
              <Stat label="Customer since" value={new Date(customer.createdAt).toLocaleDateString()} />
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">History</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Date</th><th>Event</th><th>Detail</th><th>Amount</th></tr></thead>
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
    <div className="card p-3.5">
      <div className="font-display font-semibold text-lg text-gold-600">{value}</div>
      <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
