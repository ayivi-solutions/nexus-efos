"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function SavingsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [txnAmount, setTxnAmount] = useState<Record<string, string>>({});

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

  async function handleTxn(id: string, kind: "deposit" | "withdraw") {
    const amount = Number(txnAmount[id]);
    if (!amount || amount <= 0) return;
    setError(null);
    try {
      if (kind === "deposit") await api.depositSavings(id, amount);
      else await api.withdrawSavings(id, amount);
      setTxnAmount((t) => ({ ...t, [id]: "" }));
      load();
    } catch (err: any) {
      setError(err.message || "Transaction failed");
    }
  }

  return (
    <AppShell active="Savings">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-8 gap-3">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Savings</h1>
          <button onClick={() => setShowForm((s) => !s)} className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition shrink-0">
            {showForm ? "Cancel" : "+ Open account"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleOpen} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block col-span-2">
                <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
                <select required className="input" value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)}>
                  <option value="">Select…</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={saving || !customers.length} className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60">
              {saving ? "Opening…" : "Open account"}
            </button>
            {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
          </form>
        )}

        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Transact</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 font-mono text-[12px] text-text-700">{a.accountNumber}</td>
                  <td className="px-4 py-3 text-text-900">{a.customer?.fullName}</td>
                  <td className="px-4 py-3 text-text-700">GHS {Number(a.balance).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-500">{a.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="number" min="1" placeholder="Amount" className="input !py-1 !w-24 text-[12px]" value={txnAmount[a.id] || ""} onChange={(e) => setTxnAmount((t) => ({ ...t, [a.id]: e.target.value }))} />
                      <button onClick={() => handleTxn(a.id, "deposit")} className="text-[12px] text-green-600 hover:underline">Deposit</button>
                      <button onClick={() => handleTxn(a.id, "withdraw")} className="text-[12px] text-rose-600 hover:underline">Withdraw</button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">No savings accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
