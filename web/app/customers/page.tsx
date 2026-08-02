"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

const STAGE_COLOR: Record<string, string> = {
  AWARENESS: "bg-violet-500/15 text-violet-500",
  ACQUISITION: "bg-violet-500/15 text-violet-500",
  ONBOARDING: "bg-violet-500/15 text-violet-500",
  ACTIVATION: "bg-gold-500/15 text-gold-600",
  GROWTH: "bg-green-100 text-green-600",
  RETENTION: "bg-green-100 text-green-600",
  ADVOCACY: "bg-green-100 text-green-600",
  RE_ENGAGEMENT: "bg-rose-100 text-rose-600",
};

const STATUS_COLOR: Record<string, string> = {
  REGISTERED: "bg-violet-500/15 text-violet-500",
  PENDING_VERIFICATION: "bg-violet-500/15 text-violet-500",
  PENDING_APPROVAL: "bg-violet-500/15 text-violet-500",
  VERIFIED: "bg-gold-500/15 text-gold-600",
  ACTIVE: "bg-green-100 text-green-600",
  DORMANT: "bg-paper-100 text-text-muted",
  RESTRICTED: "bg-rose-100 text-rose-600",
  SUSPENDED: "bg-rose-100 text-rose-600",
  BLACKLISTED: "bg-rose-100 text-rose-600",
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
  const toast = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [branches, setBranches] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL", branchId: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  function load() {
    api.listCustomers({ search: search || undefined }).then((res) => setCustomers(res.customers)).catch((err) => setError(err.message));
    api.listBranches().then((res) => setBranches(res.branches)).catch(() => {});
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.createCustomer(form);
      if (res.warnings?.watchlist) toast.error(`Watchlist match: ${res.warnings.watchlist}`);
      if (res.warnings?.duplicate) toast.error(`Possible duplicate: ${res.warnings.duplicate}`);
      if (!res.warnings?.watchlist && !res.warnings?.duplicate) toast.success("Customer created.");
      setForm({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL", branchId: "", address: "" });
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
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Customers</h1>
          <button onClick={() => setShowForm((s) => !s)} className="btn-dark shrink-0">
            {showForm ? "Cancel" : "+ New customer"}
          </button>
        </div>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[220px]">
            <span className="block text-[12px] text-text-500 mb-1">Search</span>
            <input className="input !py-1.5" placeholder="Name, phone, email, or ID number" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Search</button>
        </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Branch — doc §23.4 "Assign branch ownership"</span>
                <select required className="input" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">— Select a branch —</option>
                  {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Address (optional)</span>
                <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="e.g. digital address or landmark description" />
              </label>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Create customer"}
            </button>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm table-modern">
            <thead>
              <tr><th>Name</th><th>Number</th><th>Phone</th><th>Branch</th><th>Segment</th><th>Status</th><th>Stage</th><th>KYC</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="cursor-pointer">
                  <td className="text-text-900 font-medium hover:text-gold-600">{c.fullName}</td>
                  <td className="text-text-700 font-mono text-[12px]">{c.customerNumber || "—"}</td>
                  <td className="text-text-700">{c.phone}</td>
                  <td className="text-text-700">{c.branch?.name || "Unassigned"}</td>
                  <td className="text-text-700">{c.segment.replaceAll("_", " ")}</td>
                  <td><span className={`badge ${STATUS_COLOR[c.status] || ""}`}>{c.status.replaceAll("_", " ")}</span></td>
                  <td><span className={`badge ${STAGE_COLOR[c.lifecycleStage] || ""}`}>{c.lifecycleStage.replaceAll("_", " ")}</span></td>
                  <td><span className={`badge ${KYC_COLOR[c.kycStatus] || ""}`}>{c.kycStatus}</span></td>
                  <td className="space-x-1">
                    {c.watchlistFlag && <span className="badge bg-rose-100 text-rose-600">Watchlist</span>}
                    {c.possibleDuplicate && <span className="badge bg-gold-500/15 text-gold-600">Duplicate?</span>}
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={9} className="text-center text-text-muted text-sm py-8">No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
