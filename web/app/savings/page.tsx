"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function SavingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.listSavingsAccounts().then((res) => setAccounts(res.accounts)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.openSavingsAccount({ customerId: newCustomerId });
      setNewCustomerId("");
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
        <div className="flex items-center justify-between mb-8 gap-3">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Savings</h1>
          <button onClick={() => setShowForm((s) => !s)} className="btn-dark shrink-0">
            {showForm ? "Cancel" : "+ Open account"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleOpen} className="card p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block col-span-2">
                <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
                <select required className="input" value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)}>
                  <option value="">Select…</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={saving || !customers.length} className="btn-primary">
              {saving ? "Opening…" : "Open account"}
            </button>
            {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
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
