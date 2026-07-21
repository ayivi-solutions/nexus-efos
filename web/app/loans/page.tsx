"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  APPROVED: "bg-gold-500/15 text-gold-600",
  REJECTED: "bg-rose-100 text-rose-600",
  DISBURSED: "bg-green-100 text-green-600",
  ACTIVE: "bg-green-100 text-green-600",
  CLOSED: "bg-paper-100 text-text-muted",
  DEFAULTED: "bg-rose-100 text-rose-600",
};

export default function LoansPage() {
  const [loans, setLoans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: "", principal: "", interestRate: "", termMonths: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listLoans().then((res) => setLoans(res.loans)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createLoan({
        customerId: form.customerId,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        termMonths: Number(form.termMonths),
      });
      setForm({ customerId: "", principal: "", interestRate: "", termMonths: "" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create loan");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject" | "disburse") {
    setError(null);
    try {
      if (action === "approve") await api.approveLoan(id);
      if (action === "reject") await api.rejectLoan(id);
      if (action === "disburse") await api.disburseLoan(id);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    }
  }

  return (
    <AppShell active="Loans">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-8 gap-3">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Loans</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="btn-dark shrink-0"
          >
            {showForm ? "Cancel" : "+ New loan"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="card p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
                <select required className="input" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
                  <option value="">Select…</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Principal (GHS)</span>
                <input required type="number" min="1" className="input" value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Interest rate (% p.a.)</span>
                <input required type="number" min="0" step="0.1" className="input" value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Term (months)</span>
                <input required type="number" min="1" className="input" value={form.termMonths} onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))} />
              </label>
            </div>
            <button type="submit" disabled={saving || !customers.length} className="btn-primary">
              {saving ? "Saving…" : "Initiate loan"}
            </button>
            {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm table-modern">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Principal</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-900">{l.customer?.fullName}</td>
                  <td className="px-4 py-3 text-text-700">GHS {Number(l.principal).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-700">{l.interestRate}%</td>
                  <td className="px-4 py-3 text-text-700">{l.termMonths}mo</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[l.status] || ""}`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    {l.status === "PENDING" && (
                      <>
                        <button onClick={() => handleAction(l.id, "approve")} className="btn-text text-green-600">Approve</button>
                        <button onClick={() => handleAction(l.id, "reject")} className="btn-text text-rose-600">Reject</button>
                      </>
                    )}
                    {l.status === "APPROVED" && (
                      <button onClick={() => handleAction(l.id, "disburse")} className="btn-text text-gold-600">Disburse</button>
                    )}
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted text-sm">No loans yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
