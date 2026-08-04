"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function InterBranchPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"transfers" | "settlement" | "balances">("transfers");

  const [transfers, setTransfers] = useState<any[]>([]);
  const [settlementAccounts, setSettlementAccounts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  const [outstanding, setOutstanding] = useState<any>(null);

  const [transferForm, setTransferForm] = useState({ fromBranchId: "", toBranchId: "", fromGLAccountId: "", toGLAccountId: "", amount: "", description: "" });
  const [setupForm, setSetupForm] = useState({ branchId: "", glAccountCode: "", glAccountName: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api.listInterBranchTransfers().then((r) => setTransfers(r.transfers)).catch((e) => setError(e.message));
    api.listSettlementAccounts().then((r) => setSettlementAccounts(r.accounts)).catch(() => {});
    api.listBranches().then((r) => setBranches(r.branches)).catch(() => {});
    api.listGLAccounts().then((r) => setGlAccounts(r.accounts)).catch(() => {});
    api.getOutstandingBalances().then(setOutstanding).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.createSettlementAccount(setupForm); setSetupForm({ branchId: "", glAccountCode: "", glAccountName: "" }); toast.success("Settlement account created."); load(); }
    catch (err: any) { setError(err.message || "Could not create settlement account"); } finally { setBusy(false); }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.requestInterBranchTransfer({ ...transferForm, amount: Number(transferForm.amount) });
      toast.info("Transfer submitted for approval.");
      setTransferForm({ fromBranchId: "", toBranchId: "", fromGLAccountId: "", toGLAccountId: "", amount: "", description: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not request transfer"); } finally { setBusy(false); }
  }

  const branchName = (id: string) => branches.find((b: any) => b.id === id)?.name || id;

  return (
    <AppShell active="General Ledger">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Inter-Branch Accounting</h1>
        <p className="text-text-muted text-sm mb-6">doc §121 — every transfer becomes a real, balanced journal via Due To/Due From settlement accounts, routed through the Approval Workflow.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("transfers")} className={`btn-text ${tab === "transfers" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Transfers</button>
          <button onClick={() => setTab("settlement")} className={`btn-text ${tab === "settlement" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Settlement Accounts</button>
          <button onClick={() => setTab("balances")} className={`btn-text ${tab === "balances" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Outstanding Balances</button>
        </div>

        {tab === "transfers" && (
          <>
            <form onSubmit={handleTransfer} className="card p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <select required className="input" value={transferForm.fromBranchId} onChange={(e) => setTransferForm((f) => ({ ...f, fromBranchId: e.target.value }))}>
                  <option value="">From branch…</option>
                  {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
                <select required className="input" value={transferForm.toBranchId} onChange={(e) => setTransferForm((f) => ({ ...f, toBranchId: e.target.value }))}>
                  <option value="">To branch…</option>
                  {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
                <select required className="input" value={transferForm.fromGLAccountId} onChange={(e) => setTransferForm((f) => ({ ...f, fromGLAccountId: e.target.value }))}>
                  <option value="">Source account (e.g. Cash)…</option>
                  {glAccounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
                </select>
                <select required className="input" value={transferForm.toGLAccountId} onChange={(e) => setTransferForm((f) => ({ ...f, toGLAccountId: e.target.value }))}>
                  <option value="">Destination account…</option>
                  {glAccounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <input required type="number" step="0.01" placeholder="Amount" className="input !w-32" value={transferForm.amount} onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))} />
                <input required placeholder="Description" className="input flex-1 min-w-[180px]" value={transferForm.description} onChange={(e) => setTransferForm((f) => ({ ...f, description: e.target.value }))} />
                <button type="submit" disabled={busy} className="btn-primary">Request Transfer</button>
              </div>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>From</th><th>To</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead>
                <tbody>
                  {transfers.map((t: any) => (
                    <tr key={t.id}>
                      <td className="text-text-700">{branchName(t.fromBranchId)}</td>
                      <td className="text-text-700">{branchName(t.toBranchId)}</td>
                      <td className="text-text-900 font-medium">GHS {Number(t.amount).toLocaleString()}</td>
                      <td className="text-text-700 text-[12.5px]">{t.description}</td>
                      <td><span className={`badge ${t.status === "POSTED" ? "bg-green-100 text-green-600" : t.status === "REJECTED" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{t.status.replaceAll("_", " ")}</span></td>
                    </tr>
                  ))}
                  {transfers.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No transfers requested.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "settlement" && (
          <>
            <form onSubmit={handleSetup} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={setupForm.branchId} onChange={(e) => setSetupForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Branch…</option>
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
              <input required placeholder="Account code (e.g. 2900)" className="input !w-40" value={setupForm.glAccountCode} onChange={(e) => setSetupForm((f) => ({ ...f, glAccountCode: e.target.value }))} />
              <input required placeholder="Account name (e.g. Inter-Branch Settlement)" className="input flex-1 min-w-[200px]" value={setupForm.glAccountName} onChange={(e) => setSetupForm((f) => ({ ...f, glAccountName: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Branch</th><th>Account</th><th>Balance</th></tr></thead>
                <tbody>
                  {settlementAccounts.map((a: any) => (<tr key={a.id}><td className="text-text-900">{a.branchName}</td><td className="text-text-700 font-mono text-[12px]">{a.glAccount.code} — {a.glAccount.name}</td><td className="text-text-700">GHS {Number(a.glAccount.balance).toLocaleString()}</td></tr>))}
                  {settlementAccounts.length === 0 && <tr><td colSpan={3} className="text-center text-text-muted text-sm py-8">No settlement accounts set up.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "balances" && outstanding && (
          <>
            <div className={`card p-4 mb-6 ${outstanding.reconciles ? "bg-green-100/40" : "bg-rose-100/40"}`}>
              <div className={`font-medium ${outstanding.reconciles ? "text-green-600" : "text-rose-600"}`}>{outstanding.reconciles ? "✓ Reconciles — settlement accounts net to zero" : "✗ Does not reconcile — investigate"}</div>
              <div className="text-[12.5px] text-text-muted mt-1">Net total: GHS {outstanding.netTotal.toLocaleString()}</div>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Branch</th><th>Account</th><th>Balance</th><th>Position</th></tr></thead>
                <tbody>
                  {outstanding.rows.map((r: any) => (<tr key={r.branchId}><td className="text-text-900">{r.branchName}</td><td className="text-text-700 font-mono text-[12px]">{r.accountCode}</td><td className="text-text-700">GHS {r.balance.toLocaleString()}</td><td className="text-text-700">{r.position}</td></tr>))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
