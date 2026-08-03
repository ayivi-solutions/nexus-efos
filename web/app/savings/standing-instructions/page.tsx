"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function StandingInstructionsPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [form, setForm] = useState({ type: "INTERNAL_TRANSFER", sourceAccountId: "", destinationAccountId: "", destinationLoanId: "", amount: "", frequency: "MONTHLY", startDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api.listStandingInstructions().then((r) => setInstructions(r.instructions)).catch((e) => setError(e.message));
    api.listSavingsAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
    api.listLoans().then((r) => setLoans(r.loans)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createStandingInstruction({ ...form, amount: Number(form.amount) });
      toast.success("Standing instruction created.");
      setForm({ type: "INTERNAL_TRANSFER", sourceAccountId: "", destinationAccountId: "", destinationLoanId: "", amount: "", frequency: "MONTHLY", startDate: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not create instruction"); } finally { setBusy(false); }
  }

  async function handleAction(id: string, action: "suspend" | "reactivate" | "cancel") {
    setBusy(true); setError(null);
    try {
      if (action === "suspend") await api.suspendSI(id);
      else if (action === "reactivate") await api.reactivateSI(id);
      else await api.cancelSI(id);
      load();
    } catch (err: any) { setError(err.message || "Could not update instruction"); } finally { setBusy(false); }
  }

  return (
    <AppShell active="Savings">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Standing Instructions</h1>
        <p className="text-text-muted text-sm mb-6">doc §58 — real automated recurring transfers, loan repayments, and withdrawals, executed daily by the scheduler. External transfers and undsourced scheduled deposits are out of honest scope until real payment rails exist.</p>

        <form onSubmit={handleCreate} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
          <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="INTERNAL_TRANSFER">Internal Transfer</option>
            <option value="LOAN_REPAYMENT">Loan Repayment</option>
            <option value="SCHEDULED_WITHDRAWAL">Scheduled Withdrawal</option>
          </select>
          <select required className="input" value={form.sourceAccountId} onChange={(e) => setForm((f) => ({ ...f, sourceAccountId: e.target.value }))}>
            <option value="">Source account…</option>
            {accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.accountNumber} — {a.customer?.fullName}</option>))}
          </select>
          {form.type === "INTERNAL_TRANSFER" && (
            <select required className="input" value={form.destinationAccountId} onChange={(e) => setForm((f) => ({ ...f, destinationAccountId: e.target.value }))}>
              <option value="">Destination account…</option>
              {accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.accountNumber} — {a.customer?.fullName}</option>))}
            </select>
          )}
          {form.type === "LOAN_REPAYMENT" && (
            <select required className="input" value={form.destinationLoanId} onChange={(e) => setForm((f) => ({ ...f, destinationLoanId: e.target.value }))}>
              <option value="">Loan…</option>
              {loans.map((l: any) => (<option key={l.id} value={l.id}>{l.customer?.fullName} — GHS {Number(l.principal).toLocaleString()}</option>))}
            </select>
          )}
          <input required type="number" step="0.01" placeholder="Amount" className="input !w-28" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <select className="input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
            {["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"].map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
          <input required type="date" className="input" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <button type="submit" disabled={busy} className="btn-primary">Create</button>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm table-modern">
            <thead><tr><th>Type</th><th>Amount</th><th>Frequency</th><th>Next run</th><th>Failures</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {instructions.map((si: any) => (
                <tr key={si.id}>
                  <td className="text-text-700">{si.type.replaceAll("_", " ")}</td>
                  <td className="text-text-900 font-medium">GHS {Number(si.amount).toLocaleString()}</td>
                  <td className="text-text-700">{si.frequency}</td>
                  <td className="text-text-700">{new Date(si.nextExecutionDate).toLocaleDateString()}</td>
                  <td className="text-text-700">{si.consecutiveFailures}/{si.maxRetries}</td>
                  <td><span className={`badge ${si.status === "ACTIVE" ? "bg-green-100 text-green-600" : si.status === "SUSPENDED" ? "bg-gold-500/15 text-gold-600" : "bg-paper-100 text-text-muted"}`}>{si.status}</span></td>
                  <td className="whitespace-nowrap space-x-2">
                    {si.status === "ACTIVE" && <button onClick={() => handleAction(si.id, "suspend")} className="btn-text text-gold-600">Suspend</button>}
                    {si.status === "SUSPENDED" && <button onClick={() => handleAction(si.id, "reactivate")} className="btn-text text-green-600">Reactivate</button>}
                    {si.status !== "CANCELLED" && <button onClick={() => handleAction(si.id, "cancel")} className="btn-text text-rose-600">Cancel</button>}
                  </td>
                </tr>
              ))}
              {instructions.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No standing instructions.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
