"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

const STAGES = ["REGISTERED", "PENDING_VERIFICATION", "VERIFIED", "ACTIVE", "DORMANT", "RESTRICTED", "SUSPENDED", "CLOSED", "ARCHIVED"];
const KYC_STATUSES = ["PENDING", "VERIFIED", "REJECTED"];
const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

type TimelineEvent = { date: string; label: string; detail: string; amount?: string };

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [customer, setCustomer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });

  function load() {
    api.getCustomer(id).then((res) => {
      setCustomer(res.customer);
      setEditForm({ fullName: res.customer.fullName, phone: res.customer.phone, email: res.customer.email || "", segment: res.customer.segment });
    }).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStageChange(lifecycleStage: string) {
    setBusy(true); setError(null);
    try { await api.updateCustomerStage(id, lifecycleStage); load(); }
    catch (err: any) { setError(err.message || "Could not update stage"); }
    finally { setBusy(false); }
  }

  async function handleKycChange(kycStatus: string) {
    setBusy(true); setError(null);
    try { await api.updateCustomerKyc(id, kycStatus); load(); }
    catch (err: any) { setError(err.message || "Could not update KYC status"); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true); setError(null);
    try {
      await api.updateCustomer(id, { ...editForm, email: editForm.email || null });
      setEditing(false);
      load();
    } catch (err: any) { setError(err.message || "Could not update customer"); }
    finally { setBusy(false); }
  }

  async function toggleArchive() {
    setBusy(true); setError(null);
    try {
      if (customer.archived) await api.unarchiveCustomer(id);
      else await api.archiveCustomer(id);
      load();
    } catch (err: any) { setError(err.message || "Action failed"); }
    finally { setBusy(false); }
  }

  const events: TimelineEvent[] = [];
  if (customer) {
    for (const loan of customer.loans || []) {
      events.push({ date: loan.createdAt, label: "Loan initiated", detail: `${loan.status} · GHS ${Number(loan.principal).toLocaleString()} at ${loan.interestRate}% over ${loan.termMonths}mo` });
      if (loan.disbursedAt) events.push({ date: loan.disbursedAt, label: "Loan disbursed", detail: `GHS ${Number(loan.principal).toLocaleString()}` });
      for (const r of loan.repayments || []) events.push({ date: r.paidAt, label: "Loan repayment", detail: "Recorded against loan", amount: `+GHS ${Number(r.amount).toLocaleString()}` });
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
            <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
              <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600">{customer.segment.replaceAll("_", " ")}</div>
              {customer.archived && <span className="badge bg-rose-100 text-rose-600">Archived</span>}
            </div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">{customer.fullName}</h1>
            <div className="text-text-muted text-sm mb-6">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</div>

            <div className="card p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-base text-ink-900">Customer details</h2>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button onClick={saveEdit} disabled={busy} className="text-[12.5px] text-green-600 font-semibold">Save</button>
                      <button onClick={() => setEditing(false)} className="text-[12.5px] text-text-muted">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditing(true)} className="text-[12.5px] text-gold-600 font-semibold">Edit</button>
                      <button onClick={toggleArchive} disabled={busy} className={`text-[12.5px] font-semibold ${customer.archived ? "text-green-600" : "text-rose-600"}`}>
                        {customer.archived ? "Unarchive" : "Archive"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                    <input className="input" value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                    <input type="tel" className="input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Email</span>
                    <input type="email" className="input" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
                    <select className="input" value={editForm.segment} onChange={(e) => setEditForm((f) => ({ ...f, segment: e.target.value }))}>
                      {SEGMENTS.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                    </select>
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Lifecycle stage</span>
                    <select disabled={busy || customer.archived} className="input" value={customer.lifecycleStage} onChange={(e) => handleStageChange(e.target.value)}>
                      {STAGES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">KYC status</span>
                    <select disabled={busy || customer.archived} className="input" value={customer.kycStatus} onChange={(e) => handleKycChange(e.target.value)}>
                      {KYC_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </label>
                </div>
              )}
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
                      <td className={`font-mono text-[12.5px] ${e.amount?.startsWith("+") ? "text-green-600" : e.amount?.startsWith("-") ? "text-rose-600" : "text-text-muted"}`}>{e.amount || "—"}</td>
                    </tr>
                  ))}
                  {events.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No activity yet.</td></tr>}
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
