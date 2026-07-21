"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

  return (
    <AppShell active="Loans">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-8 gap-3">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Loans</h1>
          <button onClick={() => setShowForm((s) => !s)} className="btn-dark shrink-0">
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
                <span className="block text-[13px] text-text-500 mb-1.5">Principal</span>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted font-mono pointer-events-none">GHS</span>
                  <input required type="number" inputMode="decimal" min="1" step="0.01" className="input pl-12" value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} />
                </div>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Interest rate (p.a.)</span>
                <div className="relative">
                  <input required type="number" inputMode="decimal" min="0" max="100" step="0.1" className="input pr-8" value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted pointer-events-none">%</span>
                </div>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Term</span>
                <div className="relative">
                  <input required type="number" inputMode="numeric" min="1" max="360" step="1" className="input pr-16" value={form.termMonths} onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted pointer-events-none">months</span>
                </div>
              </label>
            </div>
            <button type="submit" disabled={saving || !customers.length} className="btn-primary">
              {saving ? "Saving…" : "Initiate loan"}
            </button>
            {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm table-modern">
            <thead>
              <tr><th>Customer</th><th>Principal</th><th>Rate</th><th>Term</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} onClick={() => router.push(`/loans/${l.id}`)} className="cursor-pointer">
                  <td className="text-text-900 font-medium hover:text-gold-600">{l.customer?.fullName}</td>
                  <td className="text-text-700">GHS {Number(l.principal).toLocaleString()}</td>
                  <td className="text-text-700">{l.interestRate}%</td>
                  <td className="text-text-700">{l.termMonths}mo</td>
                  <td><span className={`badge ${STATUS_COLOR[l.status] || ""}`}>{l.status}</span></td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No loans yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
