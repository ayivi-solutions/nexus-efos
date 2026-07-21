"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

const STAGE_COLOR: Record<string, string> = {
  REGISTERED: "bg-violet-500/15 text-violet-500",
  PENDING_VERIFICATION: "bg-violet-500/15 text-violet-500",
  VERIFIED: "bg-gold-500/15 text-gold-600",
  ACTIVE: "bg-green-100 text-green-600",
  DORMANT: "bg-paper-100 text-text-muted",
  RESTRICTED: "bg-rose-100 text-rose-600",
  SUSPENDED: "bg-rose-100 text-rose-600",
  CLOSED: "bg-paper-100 text-text-muted",
  ARCHIVED: "bg-paper-100 text-text-muted",
};

const KYC_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  VERIFIED: "bg-green-100 text-green-600",
  REJECTED: "bg-rose-100 text-rose-600",
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listCustomers().then((res) => setCustomers(res.customers)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createCustomer(form);
      setForm({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell active="Customers">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-8 gap-3">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Customers</h1>
          <button onClick={() => setShowForm((s) => !s)} className="btn-dark shrink-0">
            {showForm ? "Cancel" : "+ New customer"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="card p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                <input required autoComplete="name" className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                <input required type="tel" inputMode="tel" autoComplete="tel" pattern="^(0|\+233)[0-9]{9}$" title="Ghana number, e.g. 0244123456" placeholder="0244 123 456" className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Email (optional)</span>
                <input type="email" autoComplete="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
                <select className="input" value={form.segment} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}>
                  {SEGMENTS.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Create customer"}
            </button>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm table-modern">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Segment</th><th>Stage</th><th>KYC</th></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="cursor-pointer">
                  <td className="text-text-900 font-medium hover:text-gold-600">{c.fullName}</td>
                  <td className="text-text-700">{c.phone}</td>
                  <td className="text-text-700">{c.segment.replaceAll("_", " ")}</td>
                  <td><span className={`badge ${STAGE_COLOR[c.lifecycleStage] || ""}`}>{c.lifecycleStage.replaceAll("_", " ")}</span></td>
                  <td><span className={`badge ${KYC_COLOR[c.kycStatus] || ""}`}>{c.kycStatus}</span></td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
