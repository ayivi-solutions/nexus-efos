"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function CashVaultPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"vaults" | "tellers" | "transfers">("vaults");

  const [vaults, setVaults] = useState<any[]>([]);
  const [tellers, setTellers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, any[]>>({});

  const [vaultForm, setVaultForm] = useState({ branchId: "", name: "" });
  const [cashForm, setCashForm] = useState<Record<string, { type: string; amount: string; notes: string }>>({});
  const [tellerForm, setTellerForm] = useState({ employeeId: "", vaultId: "", cashLimit: "" });
  const [transfers, setTransfers] = useState<any[]>([]);
  const [transferForm, setTransferForm] = useState({ fromType: "VAULT", fromId: "", toType: "TELLER", toId: "", amount: "", isEmergency: false, reason: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api.listVaults().then((r) => setVaults(r.vaults)).catch((e) => setError(e.message));
    api.listTellers().then((r) => setTellers(r.tellers)).catch(() => {});
    api.listBranches().then((r) => setBranches(r.branches)).catch(() => {});
    api.listEmployees().then((r) => setEmployees(r.employees)).catch(() => {});
    api.listCashTransfers().then((r) => setTransfers(r.transfers)).catch(() => {});
  }

  async function handleRequestTransfer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.requestCashTransfer({ ...transferForm, amount: Number(transferForm.amount) });
      toast.info("Transfer submitted for approval.");
      setTransferForm({ fromType: "VAULT", fromId: "", toType: "TELLER", toId: "", amount: "", isEmergency: false, reason: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not request transfer"); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleCreateVault(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.createVault(vaultForm); setVaultForm({ branchId: "", name: "" }); toast.success("Vault created."); load(); }
    catch (err: any) { setError(err.message || "Could not create vault"); } finally { setBusy(false); }
  }

  async function handleVaultAction(id: string, action: "open" | "close") {
    setBusy(true); setError(null);
    try { action === "open" ? await api.openVault(id) : await api.closeVault(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function loadLedger(vaultId: string) {
    try { const r = await api.listVaultLedger(vaultId); setLedgers((l) => ({ ...l, [vaultId]: r.entries })); } catch {}
  }

  async function handleRecordCash(vaultId: string) {
    const f = cashForm[vaultId];
    if (!f?.amount) return;
    setBusy(true); setError(null);
    try {
      await api.recordVaultCash(vaultId, { type: f.type as "RECEIPT" | "WITHDRAWAL", amount: Number(f.amount), notes: f.notes || undefined });
      setCashForm((c) => ({ ...c, [vaultId]: { type: "RECEIPT", amount: "", notes: "" } }));
      load(); loadLedger(vaultId);
    } catch (err: any) { setError(err.message || "Could not record cash entry"); } finally { setBusy(false); }
  }

  async function handleRegisterTeller(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.registerTeller({ employeeId: tellerForm.employeeId, vaultId: tellerForm.vaultId || undefined, cashLimit: Number(tellerForm.cashLimit) });
      setTellerForm({ employeeId: "", vaultId: "", cashLimit: "" });
      toast.success("Teller registered.");
      load();
    } catch (err: any) { setError(err.message || "Could not register teller"); } finally { setBusy(false); }
  }

  async function handleTellerAction(id: string, action: "suspend" | "reinstate") {
    setBusy(true); setError(null);
    try {
      if (action === "suspend") { const reason = window.prompt("Reason for suspending this teller:"); if (reason === null) return; await api.suspendTeller(id, reason); }
      else await api.reinstateTeller(id);
      load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  const registeredEmployeeIds = new Set(tellers.map((t) => t.employeeId));

  return (
    <AppShell active="Cash & Vault">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Cash & Vault</h1>
        <p className="text-text-muted text-sm mb-6">doc §112/§113 — vault and teller administration. Cash Transfers and Balancing/Reconciliation are their own next piece.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("vaults")} className={`btn-text ${tab === "vaults" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Vaults</button>
          <button onClick={() => setTab("tellers")} className={`btn-text ${tab === "tellers" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Tellers</button>
          <button onClick={() => setTab("transfers")} className={`btn-text ${tab === "transfers" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Transfers</button>
        </div>

        {tab === "vaults" && (
          <>
            <form onSubmit={handleCreateVault} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={vaultForm.branchId} onChange={(e) => setVaultForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Branch…</option>
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
              <input required placeholder="Vault name" className="input" value={vaultForm.name} onChange={(e) => setVaultForm((f) => ({ ...f, name: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create vault</button>
            </form>

            {vaults.map((v: any) => (
              <div key={v.id} className="card p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-display font-semibold text-base text-ink-900">{v.name}</span>
                    <span className={`badge ml-2 ${v.status === "OPEN" ? "bg-green-100 text-green-600" : "bg-paper-100 text-text-muted"}`}>{v.status}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-text-900 font-medium">GHS {Number(v.balance).toLocaleString()}</span>
                    {v.status === "CLOSED" ? <button onClick={() => handleVaultAction(v.id, "open")} className="btn-text text-green-600">Open</button> : <button onClick={() => handleVaultAction(v.id, "close")} className="btn-text text-rose-600">Close</button>}
                  </div>
                </div>
                {v.status === "OPEN" && (
                  <div className="flex flex-wrap items-end gap-2 mb-2">
                    <select className="input !text-[12px]" value={cashForm[v.id]?.type || "RECEIPT"} onChange={(e) => setCashForm((c) => ({ ...c, [v.id]: { ...(c[v.id] || { amount: "", notes: "" }), type: e.target.value } }))}>
                      <option value="RECEIPT">Receipt (cash in)</option>
                      <option value="WITHDRAWAL">Withdrawal (cash out)</option>
                    </select>
                    <input type="number" step="0.01" placeholder="Amount" className="input !text-[12px] !w-28" value={cashForm[v.id]?.amount || ""} onChange={(e) => setCashForm((c) => ({ ...c, [v.id]: { ...(c[v.id] || { type: "RECEIPT", notes: "" }), amount: e.target.value } }))} />
                    <input placeholder="Notes" className="input !text-[12px]" value={cashForm[v.id]?.notes || ""} onChange={(e) => setCashForm((c) => ({ ...c, [v.id]: { ...(c[v.id] || { type: "RECEIPT", amount: "" }), notes: e.target.value } }))} />
                    <button onClick={() => handleRecordCash(v.id)} disabled={busy} className="btn-text text-gold-600">Record</button>
                    <button onClick={() => loadLedger(v.id)} className="btn-text text-text-muted">View ledger</button>
                  </div>
                )}
                {ledgers[v.id] && (
                  <div className="text-[12px] text-text-700 space-y-1 mt-2 border-t border-paper-100 pt-2">
                    {ledgers[v.id].map((e: any) => (<div key={e.id}>{new Date(e.recordedAt).toLocaleString()} — {e.type} GHS {Number(e.amount).toLocaleString()} (balance: GHS {Number(e.balanceAfter).toLocaleString()})</div>))}
                    {ledgers[v.id].length === 0 && <div className="text-text-muted">No entries yet.</div>}
                  </div>
                )}
              </div>
            ))}
            {vaults.length === 0 && <p className="text-text-muted text-sm text-center py-8">No vaults created.</p>}
          </>
        )}

        {tab === "tellers" && (
          <>
            <form onSubmit={handleRegisterTeller} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={tellerForm.employeeId} onChange={(e) => setTellerForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Employee…</option>
                {employees.filter((e: any) => !registeredEmployeeIds.has(e.id)).map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <select className="input" value={tellerForm.vaultId} onChange={(e) => setTellerForm((f) => ({ ...f, vaultId: e.target.value }))}>
                <option value="">Assign to vault…</option>
                {vaults.map((v: any) => (<option key={v.id} value={v.id}>{v.name}</option>))}
              </select>
              <input required type="number" step="0.01" placeholder="Cash limit" className="input !w-32" value={tellerForm.cashLimit} onChange={(e) => setTellerForm((f) => ({ ...f, cashLimit: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Register teller</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Name</th><th>Vault</th><th>Cash Limit</th><th>Holding</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {tellers.map((t: any) => (
                    <tr key={t.id}>
                      <td className="text-text-900 font-medium">{t.employeeName || "—"}</td>
                      <td className="text-text-700">{t.vault?.name || "Unassigned"}</td>
                      <td className="text-text-700">GHS {Number(t.cashLimit).toLocaleString()}</td>
                      <td className="text-text-700">GHS {Number(t.currentHolding).toLocaleString()}</td>
                      <td><span className={`badge ${t.status === "ACTIVE" ? "bg-green-100 text-green-600" : "bg-rose-100 text-rose-600"}`}>{t.status}</span></td>
                      <td>{t.status === "ACTIVE" ? <button onClick={() => handleTellerAction(t.id, "suspend")} className="btn-text text-rose-600">Suspend</button> : <button onClick={() => handleTellerAction(t.id, "reinstate")} className="btn-text text-green-600">Reinstate</button>}</td>
                    </tr>
                  ))}
                  {tellers.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No tellers registered.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "transfers" && (
          <>
            <form onSubmit={handleRequestTransfer} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select className="input !w-28" value={transferForm.fromType} onChange={(e) => setTransferForm((f) => ({ ...f, fromType: e.target.value, fromId: "" }))}>
                <option value="VAULT">Vault</option><option value="TELLER">Teller</option>
              </select>
              <select required className="input" value={transferForm.fromId} onChange={(e) => setTransferForm((f) => ({ ...f, fromId: e.target.value }))}>
                <option value="">From…</option>
                {(transferForm.fromType === "VAULT" ? vaults : tellers).map((x: any) => (<option key={x.id} value={x.id}>{x.name || x.employeeName}</option>))}
              </select>
              <select className="input !w-28" value={transferForm.toType} onChange={(e) => setTransferForm((f) => ({ ...f, toType: e.target.value, toId: "" }))}>
                <option value="VAULT">Vault</option><option value="TELLER">Teller</option>
              </select>
              <select required className="input" value={transferForm.toId} onChange={(e) => setTransferForm((f) => ({ ...f, toId: e.target.value }))}>
                <option value="">To…</option>
                {(transferForm.toType === "VAULT" ? vaults : tellers).map((x: any) => (<option key={x.id} value={x.id}>{x.name || x.employeeName}</option>))}
              </select>
              <input required type="number" step="0.01" placeholder="Amount" className="input !w-28" value={transferForm.amount} onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))} />
              <input required placeholder="Reason" className="input flex-1 min-w-[140px]" value={transferForm.reason} onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))} />
              <label className="flex items-center gap-1 text-[12px] text-text-700">
                <input type="checkbox" checked={transferForm.isEmergency} onChange={(e) => setTransferForm((f) => ({ ...f, isEmergency: e.target.checked }))} /> Emergency
              </label>
              <button type="submit" disabled={busy} className="btn-primary">Request</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>From</th><th>To</th><th>Amount</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>
                  {transfers.map((t: any) => (
                    <tr key={t.id}>
                      <td className="text-text-700">{t.fromType}</td>
                      <td className="text-text-700">{t.toType}</td>
                      <td className="text-text-900 font-medium">GHS {Number(t.amount).toLocaleString()}{t.isEmergency && <span className="ml-1 text-rose-600 text-[10px]">EMERGENCY</span>}</td>
                      <td className="text-text-700 text-[12.5px]">{t.reason}</td>
                      <td><span className={`badge ${t.status === "COMPLETED" ? "bg-green-100 text-green-600" : t.status === "REJECTED" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{t.status.replaceAll("_", " ")}</span></td>
                    </tr>
                  ))}
                  {transfers.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No transfers requested.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
