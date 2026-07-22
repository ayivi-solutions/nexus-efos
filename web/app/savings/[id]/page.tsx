"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function SavingsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [account, setAccount] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [holderForm, setHolderForm] = useState({ customerId: "", role: "JOINT" });

  function load() {
    api.getSavingsAccount(id).then((res) => setAccount(res.account)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddHolder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addSavingsHolder(id, holderForm);
      setHolderForm({ customerId: "", role: "JOINT" });
      load();
    } catch (err: any) { setError(err.message || "Could not add account holder"); }
    finally { setBusy(false); }
  }

  async function handleRemoveHolder(holderId: string) {
    setBusy(true); setError(null);
    try { await api.removeSavingsHolder(id, holderId); load(); }
    catch (err: any) { setError(err.message || "Could not remove holder"); }
    finally { setBusy(false); }
  }

  async function handleTxn(kind: "deposit" | "withdraw") {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "deposit") await api.depositSavings(id, amt);
      else await api.withdrawSavings(id, amt);
      setAmount("");
      load();
    } catch (err: any) {
      setError(err.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    setError(null);
    try {
      await api.closeSavingsAccount(id);
      load();
    } catch (err: any) {
      setError(err.message || "Could not close account");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    setError(null);
    try {
      await api.reactivateSavingsAccount(id);
      load();
    } catch (err: any) {
      setError(err.message || "Could not reactivate account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell active="Savings">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <button onClick={() => router.push("/savings")} className="text-[13px] text-text-muted hover:text-text-700 mb-4">← Back to Savings</button>

        {!account && !error && <p className="text-text-muted text-sm">Loading…</p>}

        {account && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
              <div>
                <Link href={`/customers/${account.customer.id}`} className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 hover:text-gold-600 selectable">
                  {account.customer.fullName}
                </Link>
                <div className="text-text-muted text-sm mt-1 font-mono selectable">{account.accountNumber} · {account.branch?.name || "Unassigned branch"}</div>
              </div>
              <span className="badge bg-green-100 text-green-600">{account.status}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <Stat label="Balance" value={`GHS ${Number(account.balance).toLocaleString()}`} />
              <Stat label="Opened" value={new Date(account.createdAt).toLocaleDateString()} />
            </div>

            <div className="card p-6 mb-8">
              <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Transact</h2>
              {account.status === "CLOSED" ? (
                <p className="text-text-muted text-sm">This account is closed. Reactivate it below to resume transactions.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted font-mono pointer-events-none">GHS</span>
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" className="input pl-12 !w-40" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <button onClick={() => handleTxn("deposit")} disabled={busy} className="btn-primary">Deposit</button>
                  <button onClick={() => handleTxn("withdraw")} disabled={busy} className="px-4 py-2.5 rounded-[10px] border border-rose-600 text-rose-600 font-semibold text-sm hover:bg-rose-100 transition">Withdraw</button>
                </div>
              )}
              <div className="pt-4 border-t border-paper-100">
                {account.status === "CLOSED" ? (
                  <button onClick={handleReactivate} disabled={busy} className="text-[13px] text-green-600 font-semibold">Reactivate account</button>
                ) : (
                  <>
                    <button onClick={handleClose} disabled={busy || Number(account.balance) !== 0} className="text-[13px] text-rose-600 font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Close account</button>
                    {Number(account.balance) !== 0 && <p className="text-text-muted text-xs mt-1">Balance must be GHS 0 before closing.</p>}
                  </>
                )}
              </div>
            </div>

            {/* Account Holders — doc §36. account.customer above is the Primary Holder. */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Account holders</h2>
            <form onSubmit={handleAddHolder} className="card p-5 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <select required className="input !py-1.5" value={holderForm.customerId} onChange={(e) => setHolderForm((f) => ({ ...f, customerId: e.target.value }))}>
                  <option value="">Select customer…</option>
                  {customers.filter((c) => c.id !== account.customer.id).map((c) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                </select>
                <select className="input !py-1.5" value={holderForm.role} onChange={(e) => setHolderForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="JOINT">Joint Account Holder</option>
                  <option value="AUTHORISED_SIGNATORY">Authorised Signatory</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="NOMINEE">Nominee</option>
                  <option value="POWER_OF_ATTORNEY">Power of Attorney</option>
                  <option value="CORPORATE_REPRESENTATIVE">Corporate Representative</option>
                </select>
                <button type="submit" disabled={busy} className="btn-text text-gold-600 justify-self-start">+ Add holder</button>
              </div>
            </form>
            <div className="space-y-2 mb-10">
              {(account.accountHolders || []).map((h: any) => (
                <div key={h.id} className="card p-3 flex items-center justify-between text-[13px]">
                  <span className="text-text-700"><b className="text-text-900">{h.customer.fullName}</b> · {h.role.replaceAll("_", " ")}</span>
                  <button onClick={() => handleRemoveHolder(h.id)} className="text-rose-600 text-[12px]">Remove</button>
                </div>
              ))}
              {(!account.accountHolders || account.accountHolders.length === 0) && <p className="text-text-muted text-sm">No additional holders — {account.customer.fullName} is the sole (primary) holder.</p>}
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Transaction history</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm table-modern">
                <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance after</th></tr></thead>
                <tbody>
                  {account.transactions.map((t: any) => (
                    <tr key={t.id}>
                      <td className="text-text-700">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="text-text-700">{t.type}</td>
                      <td className={`font-mono ${t.type === "DEPOSIT" ? "text-green-600" : "text-rose-600"}`}>
                        {t.type === "DEPOSIT" ? "+" : "-"}GHS {Number(t.amount).toLocaleString()}
                      </td>
                      <td className="text-text-700">GHS {Number(t.balanceAfter).toLocaleString()}</td>
                    </tr>
                  ))}
                  {account.transactions.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No transactions yet.</td></tr>
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
      <div className="font-display font-semibold text-lg text-gold-600 selectable">{value}</div>
      <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
