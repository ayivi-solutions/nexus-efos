"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-violet-500/15 text-violet-500",
  ACTIVE: "bg-green-100 text-green-600",
  WITHDRAWN: "bg-gold-500/15 text-gold-600",
  ARCHIVED: "bg-paper-100 text-text-muted",
};

const emptyForm = {
  code: "",
  type: "LOAN",
  name: "",
  description: "",
  interestMethod: "FLAT",
  interestRate: "",
  minLoanAmount: "",
  maxLoanAmount: "",
  minTenureMonths: "",
  maxTenureMonths: "",
  minOpeningBalance: "",
  minOperatingBalance: "",
  maxBalance: "",
  minDeposit: "",
  maxDeposit: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.listProducts().then((res) => setProducts(res.products)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  function num(v: string) {
    return v === "" ? undefined : Number(v);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createProduct({
        code: form.code,
        type: form.type,
        name: form.name,
        description: form.description || undefined,
        interestMethod: form.interestMethod,
        interestRate: Number(form.interestRate),
        ...(form.type === "LOAN"
          ? {
              minLoanAmount: num(form.minLoanAmount),
              maxLoanAmount: num(form.maxLoanAmount),
              minTenureMonths: num(form.minTenureMonths),
              maxTenureMonths: num(form.maxTenureMonths),
            }
          : {
              minOpeningBalance: num(form.minOpeningBalance),
              minOperatingBalance: num(form.minOperatingBalance),
              maxBalance: num(form.maxBalance),
              minDeposit: num(form.minDeposit),
              maxDeposit: num(form.maxDeposit),
            }),
      });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create product");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusAction(id: string, action: "activate" | "withdraw" | "archive") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "activate") await api.activateProduct(id);
      if (action === "withdraw") await api.withdrawProduct(id);
      if (action === "archive") await api.archiveProduct(id);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell active="Products">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-8 gap-3">
          <div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Products</h1>
            <p className="text-text-muted text-sm mt-1">doc §47/§62 — Loans and Savings accounts must reference an active, versioned product.</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="btn-dark shrink-0">{showForm ? "Cancel" : "+ New product"}</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="card p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Code</span>
                <input required className="input uppercase" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. LN-01" />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Type</span>
                <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="LOAN">Loan</option>
                  <option value="SAVINGS">Savings</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[13px] text-text-500 mb-1.5">Product name</span>
                <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Business Growth Loan" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Interest rate (p.a.)</span>
                <div className="relative">
                  <input required type="number" inputMode="decimal" min="0" max="100" step="0.1" className="input pr-8" value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted pointer-events-none">%</span>
                </div>
              </label>
              {form.type === "LOAN" && (
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Interest method</span>
                  <select className="input" value={form.interestMethod} onChange={(e) => setForm((f) => ({ ...f, interestMethod: e.target.value }))}>
                    <option value="FLAT">Flat</option>
                    <option value="REDUCING_BALANCE">Reducing balance</option>
                  </select>
                </label>
              )}
            </div>

            {form.type === "LOAN" ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Min amount (optional)</span>
                  <input type="number" className="input" value={form.minLoanAmount} onChange={(e) => setForm((f) => ({ ...f, minLoanAmount: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Max amount (optional)</span>
                  <input type="number" className="input" value={form.maxLoanAmount} onChange={(e) => setForm((f) => ({ ...f, maxLoanAmount: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Min tenure, mo (optional)</span>
                  <input type="number" className="input" value={form.minTenureMonths} onChange={(e) => setForm((f) => ({ ...f, minTenureMonths: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Max tenure, mo (optional)</span>
                  <input type="number" className="input" value={form.maxTenureMonths} onChange={(e) => setForm((f) => ({ ...f, maxTenureMonths: e.target.value }))} />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Min opening (optional)</span>
                  <input type="number" className="input" value={form.minOpeningBalance} onChange={(e) => setForm((f) => ({ ...f, minOpeningBalance: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Min operating (optional)</span>
                  <input type="number" className="input" value={form.minOperatingBalance} onChange={(e) => setForm((f) => ({ ...f, minOperatingBalance: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Max balance (optional)</span>
                  <input type="number" className="input" value={form.maxBalance} onChange={(e) => setForm((f) => ({ ...f, maxBalance: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Min deposit (optional)</span>
                  <input type="number" className="input" value={form.minDeposit} onChange={(e) => setForm((f) => ({ ...f, minDeposit: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Max deposit (optional)</span>
                  <input type="number" className="input" value={form.maxDeposit} onChange={(e) => setForm((f) => ({ ...f, maxDeposit: e.target.value }))} />
                </label>
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create product"}</button>
            <p className="text-text-muted text-xs mt-2">New products start as Draft — activate them below before they can be used to open loans or accounts.</p>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm table-modern">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Rate</th><th>Version</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-[12px] text-text-700">{p.code}</td>
                  <td className="text-text-900">{p.currentVersion?.name}</td>
                  <td className="text-text-700">{p.type}</td>
                  <td className="text-text-700">{p.currentVersion ? `${p.currentVersion.interestRate}%` : "—"}</td>
                  <td className="text-text-700">v{p.currentVersion?.versionNumber}</td>
                  <td><span className={`badge ${STATUS_COLOR[p.status] || ""}`}>{p.status}</span></td>
                  <td className="whitespace-nowrap space-x-2">
                    {p.status === "DRAFT" && (
                      <button onClick={() => handleStatusAction(p.id, "activate")} disabled={busyId === p.id} className="btn-text text-green-600">Activate</button>
                    )}
                    {p.status === "ACTIVE" && (
                      <button onClick={() => handleStatusAction(p.id, "withdraw")} disabled={busyId === p.id} className="btn-text text-gold-600">Withdraw</button>
                    )}
                    {p.status === "WITHDRAWN" && (
                      <>
                        <button onClick={() => handleStatusAction(p.id, "activate")} disabled={busyId === p.id} className="btn-text text-green-600">Reactivate</button>
                        <button onClick={() => handleStatusAction(p.id, "archive")} disabled={busyId === p.id} className="btn-text text-rose-600">Archive</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
