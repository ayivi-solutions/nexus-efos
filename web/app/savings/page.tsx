"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function SavingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newProductVersionId, setNewProductVersionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showGLMapping, setShowGLMapping] = useState(false);
  const [glMappings, setGlMappings] = useState<any>({ mappings: [], purposes: [], accounts: [] });
  const [mappingForm, setMappingForm] = useState({ purpose: "", glAccountId: "" });
  const [mappingBusy, setMappingBusy] = useState(false);

  function load() {
    api.listSavingsAccounts().then((res) => setAccounts(res.accounts)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
    api.listProducts("SAVINGS").then((res) => setProducts(res.products.filter((p: any) => p.status === "ACTIVE"))).catch(() => {});
    api.listSavingsGLMappings().then(setGlMappings).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleSetMapping(e: React.FormEvent) {
    e.preventDefault();
    setMappingBusy(true);
    try {
      await api.setSavingsGLMapping(mappingForm.purpose, mappingForm.glAccountId);
      setMappingForm({ purpose: "", glAccountId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not save mapping");
    } finally {
      setMappingBusy(false);
    }
  }

  async function handleAccrueAll() {
    setBatchBusy(true); setError(null);
    try {
      const res = await api.accrueInterestAll();
      toast.success(`Accrued interest for ${res.accountsProcessed} account(s), ${res.accrualRowsCreated} period(s) total.`);
      load();
    } catch (err: any) { setError(err.message || "Batch accrual failed"); }
    finally { setBatchBusy(false); }
  }

  async function handlePostAll() {
    setBatchBusy(true); setError(null);
    try {
      const res = await api.postInterestAll();
      toast.success(`Posted GHS ${Number(res.totalPosted).toLocaleString()} across ${res.accountsPosted} account(s).`);
      load();
    } catch (err: any) { setError(err.message || "Batch posting failed"); }
    finally { setBatchBusy(false); }
  }

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.openSavingsAccount({ customerId: newCustomerId, productVersionId: newProductVersionId });
      setNewCustomerId("");
      setNewProductVersionId("");
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not open account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell active="Savings">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Savings</h1>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowGLMapping((s) => !s)} className="btn-dark">
              {showGLMapping ? "Hide GL Mapping" : "GL Mapping"}
            </button>
            <button onClick={() => setShowForm((s) => !s)} className="btn-dark">
              {showForm ? "Cancel" : "+ Open account"}
            </button>
          </div>
        </div>

        {showGLMapping && (
          <div className="mb-8">
            <p className="text-[12.5px] text-text-muted mb-4">Real accounts a savings deposit or withdrawal debits/credits. Both purposes must be mapped before deposits/withdrawals can be recorded — GAP-GL-001: this is a real financial transaction now, not just a balance change, so it hard-blocks without this configured rather than proceeding with a silent accounting gap. A deposit increases what the institution owes the customer (a liability), not an asset it owns.</p>
            <form onSubmit={handleSetMapping} className="card p-4 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={mappingForm.purpose} onChange={(e) => setMappingForm((f) => ({ ...f, purpose: e.target.value }))}>
                <option value="">Purpose…</option>
                {glMappings.purposes.map((p: string) => (<option key={p} value={p}>{p}</option>))}
              </select>
              <select required className="input" value={mappingForm.glAccountId} onChange={(e) => setMappingForm((f) => ({ ...f, glAccountId: e.target.value }))}>
                <option value="">GL Account…</option>
                {glMappings.accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
              </select>
              <button type="submit" disabled={mappingBusy} className="btn-primary">Save Mapping</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Purpose</th><th>Mapped Account</th></tr></thead>
                <tbody>
                  {glMappings.purposes.map((p: string) => {
                    const m = glMappings.mappings.find((x: any) => x.purpose === p);
                    return (<tr key={p}><td className="text-text-900">{p}</td><td className="text-text-700">{m?.account ? `${m.account.code} — ${m.account.name}` : <span className="text-rose-600">Not mapped</span>}</td></tr>);
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card p-4 mb-8 flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-text-500">doc §52/§119 — institution-wide interest processing:</span>
          <button onClick={handleAccrueAll} disabled={batchBusy} className="btn-text text-gold-600">Run accrual for all accounts</button>
          <button onClick={handlePostAll} disabled={batchBusy} className="btn-text text-green-600">Post interest for all accounts</button>
        </div>

        {showForm && (
          <form onSubmit={handleOpen} className="card p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
                <select required className="input" value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)}>
                  <option value="">Select…</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[13px] text-text-500 mb-1.5">Savings product</span>
                <select required className="input" value={newProductVersionId} onChange={(e) => setNewProductVersionId(e.target.value)}>
                  <option value="">Select…</option>
                  {products.map((p) => (<option key={p.id} value={p.currentVersion.id}>{p.currentVersion.name} ({p.currentVersion.interestRate}% p.a.)</option>))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={saving || !customers.length || !products.length} className="btn-primary">
              {saving ? "Opening…" : "Open account"}
            </button>
            {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
            {customers.length > 0 && !products.length && <p className="text-text-muted text-xs mt-2">No active savings products yet — create and activate one on the Products page.</p>}
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm table-modern">
            <thead><tr><th>Account</th><th>Customer</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} onClick={() => router.push(`/savings/${a.id}`)} className="cursor-pointer">
                  <td className="font-mono text-[12px] text-text-700">{a.accountNumber}</td>
                  <td className="text-text-900 font-medium hover:text-gold-600">{a.customer?.fullName}</td>
                  <td className="text-text-700">GHS {Number(a.balance).toLocaleString()}</td>
                  <td className="text-text-500">{a.status}</td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No savings accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
