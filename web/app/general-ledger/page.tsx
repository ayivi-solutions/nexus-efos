"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const CATEGORIES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export default function GeneralLedgerPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"accounts" | "journals" | "periods" | "recurring">("accounts");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [accountForm, setAccountForm] = useState({ code: "", name: "", category: "ASSET" });
  const [journalForm, setJournalForm] = useState({ description: "", postingDate: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [yearForm, setYearForm] = useState({ name: "", startDate: "", endDate: "" });
  const [periodForm, setPeriodForm] = useState({ fiscalYearId: "", name: "", startDate: "", endDate: "" });
  const [recurringJournals, setRecurringJournals] = useState<any[]>([]);
  const [recurringForm, setRecurringForm] = useState({ description: "", frequency: "MONTHLY", customIntervalDays: "", startDate: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
  const [busy, setBusy] = useState(false);

  function load() {
    api.listGLAccounts().then((r) => setAccounts(r.accounts)).catch((e) => setError(e.message));
    api.listJournals().then((r) => setJournals(r.journals)).catch(() => {});
    api.listFiscalYears().then((r) => setFiscalYears(r.fiscalYears)).catch(() => {});
    api.listRecurringJournals().then((r) => setRecurringJournals(r.recurringJournals)).catch(() => {});
  }

  function updateRecurringLine(i: number, key: string, value: string) {
    setRecurringForm((f) => { const lines = [...f.lines]; lines[i] = { ...lines[i], [key]: value }; return { ...f, lines }; });
  }

  async function handleCreateRecurring(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createRecurringJournal({
        description: recurringForm.description, frequency: recurringForm.frequency,
        customIntervalDays: recurringForm.customIntervalDays ? Number(recurringForm.customIntervalDays) : undefined,
        startDate: recurringForm.startDate,
        lines: recurringForm.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      });
      toast.success("Recurring journal created as DRAFT.");
      setRecurringForm({ description: "", frequency: "MONTHLY", customIntervalDays: "", startDate: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
      load();
    } catch (err: any) { setError(err.message || "Could not create recurring journal"); } finally { setBusy(false); }
  }

  async function handleRecurringAction(id: string, action: "activate" | "suspend" | "reactivate") {
    setBusy(true); setError(null);
    try {
      if (action === "activate") { await api.requestRecurringActivation(id); toast.info("Submitted for approval."); }
      else if (action === "suspend") await api.suspendRecurringJournal(id);
      else await api.reactivateRecurringJournal(id);
      load();
    } catch (err: any) { setError(err.message || "Could not update recurring journal"); } finally { setBusy(false); }
  }

  async function handleCreateFiscalYear(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.createFiscalYear(yearForm); setYearForm({ name: "", startDate: "", endDate: "" }); toast.success("Fiscal year created."); load(); }
    catch (err: any) { setError(err.message || "Could not create fiscal year"); } finally { setBusy(false); }
  }

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.createFinancialPeriod(periodForm); setPeriodForm({ fiscalYearId: "", name: "", startDate: "", endDate: "" }); toast.success("Period created."); load(); }
    catch (err: any) { setError(err.message || "Could not create period"); } finally { setBusy(false); }
  }

  async function handlePeriodAction(id: string, action: "close" | "lock" | "reopen") {
    setBusy(true); setError(null);
    try {
      if (action === "close") await api.closeFinancialPeriod(id);
      else if (action === "lock") await api.lockFinancialPeriod(id);
      else { const reason = window.prompt("Reason for requesting reopen:"); if (!reason) return; await api.requestPeriodReopen(id, reason); toast.info("Reopen submitted for approval."); }
      load();
    } catch (err: any) { setError(err.message || "Could not update period"); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.createGLAccount(accountForm); setAccountForm({ code: "", name: "", category: "ASSET" }); toast.success("Account created."); load(); }
    catch (err: any) { setError(err.message || "Could not create account"); } finally { setBusy(false); }
  }

  async function handleToggleAccount(id: string, current: string) {
    setBusy(true); setError(null);
    try { await api.setGLAccountStatus(id, current === "ACTIVE" ? "INACTIVE" : "ACTIVE"); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  function updateLine(i: number, key: string, value: string) {
    setJournalForm((f) => { const lines = [...f.lines]; lines[i] = { ...lines[i], [key]: value }; return { ...f, lines }; });
  }

  async function handleCreateJournal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createJournal({
        description: journalForm.description,
        postingDate: journalForm.postingDate,
        lines: journalForm.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      });
      toast.success("Journal created as DRAFT.");
      setJournalForm({ description: "", postingDate: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
      load();
    } catch (err: any) { setError(err.message || "Could not create journal"); } finally { setBusy(false); }
  }

  async function handleRequestPosting(id: string) {
    setBusy(true); setError(null);
    try { await api.requestJournalPosting(id); toast.info("Posting submitted for approval."); load(); }
    catch (err: any) { setError(err.message || "Could not request posting"); } finally { setBusy(false); }
  }

  const totalDebit = journalForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = journalForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  return (
    <AppShell active="General Ledger">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">General Ledger</h1>
        <p className="text-text-muted text-sm mb-6">doc §117/§118/§119 — the core double-entry engine. Not yet auto-posting from Savings/Loans/Cash & Vault; that's a separate, named next increment.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("accounts")} className={`btn-text ${tab === "accounts" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Chart of Accounts</button>
          <button onClick={() => setTab("journals")} className={`btn-text ${tab === "journals" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Journals</button>
          <button onClick={() => setTab("periods")} className={`btn-text ${tab === "periods" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Fiscal Periods</button>
          <button onClick={() => setTab("recurring")} className={`btn-text ${tab === "recurring" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Recurring Journals</button>
        </div>

        {tab === "accounts" && (
          <>
            <form onSubmit={handleCreateAccount} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <input required placeholder="Code (e.g. 1000)" className="input !w-32" value={accountForm.code} onChange={(e) => setAccountForm((f) => ({ ...f, code: e.target.value }))} />
              <input required placeholder="Account name" className="input flex-1 min-w-[180px]" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="input" value={accountForm.category} onChange={(e) => setAccountForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {accounts.map((a: any) => (
                    <tr key={a.id}>
                      <td className="font-mono text-[12px] text-text-700">{a.code}</td>
                      <td className="text-text-900 font-medium">{a.name}</td>
                      <td className="text-text-700">{a.category}</td>
                      <td className="text-text-700">GHS {Number(a.balance).toLocaleString()}</td>
                      <td><span className={`badge ${a.status === "ACTIVE" ? "bg-green-100 text-green-600" : "bg-paper-100 text-text-muted"}`}>{a.status}</span></td>
                      <td><button onClick={() => handleToggleAccount(a.id, a.status)} className="btn-text text-gold-600">{a.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td>
                    </tr>
                  ))}
                  {accounts.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No accounts created.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "journals" && (
          <>
            <form onSubmit={handleCreateJournal} className="card p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input required placeholder="Description" className="input" value={journalForm.description} onChange={(e) => setJournalForm((f) => ({ ...f, description: e.target.value }))} />
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Posting date</span>
                  <input required type="date" className="input" value={journalForm.postingDate} onChange={(e) => setJournalForm((f) => ({ ...f, postingDate: e.target.value }))} />
                </label>
              </div>
              {journalForm.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                  <select required className="input !py-1.5" value={l.accountId} onChange={(e) => updateLine(i, "accountId", e.target.value)}>
                    <option value="">Account…</option>
                    {accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
                  </select>
                  <input type="number" step="0.01" placeholder="Debit" className="input !py-1.5" value={l.debit} onChange={(e) => updateLine(i, "debit", e.target.value)} />
                  <input type="number" step="0.01" placeholder="Credit" className="input !py-1.5" value={l.credit} onChange={(e) => updateLine(i, "credit", e.target.value)} />
                </div>
              ))}
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setJournalForm((f) => ({ ...f, lines: [...f.lines, { accountId: "", debit: "", credit: "" }] }))} className="btn-text text-gold-600">+ Add line</button>
                {journalForm.lines.length > 2 && <button type="button" onClick={() => setJournalForm((f) => ({ ...f, lines: f.lines.slice(0, -1) }))} className="btn-text text-rose-600">Remove last</button>}
              </div>
              <div className={`text-[12.5px] mb-3 ${totalDebit === totalCredit && totalDebit > 0 ? "text-green-600" : "text-rose-600"}`}>
                Total debit: GHS {totalDebit.toLocaleString()} · Total credit: GHS {totalCredit.toLocaleString()} {totalDebit === totalCredit && totalDebit > 0 ? "✓ Balanced" : "— must balance before creating"}
              </div>
              <button type="submit" disabled={busy} className="btn-primary">Create journal (as Draft)</button>
            </form>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Journal #</th><th>Description</th><th>Type</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {journals.map((j: any) => (
                    <tr key={j.id}>
                      <td className="font-mono text-[12px] text-text-700">{j.journalNumber}</td>
                      <td className="text-text-900">
                        {j.description}
                        {j.status === "REJECTED" && j.rejectionReason && <div className="text-rose-600 text-[11px] mt-0.5">{j.rejectionReason}</div>}
                      </td>
                      <td className="text-text-700">{j.type}</td>
                      <td><span className={`badge ${j.status === "POSTED" ? "bg-green-100 text-green-600" : j.status === "REJECTED" ? "bg-rose-100 text-rose-600" : j.status === "PENDING_APPROVAL" ? "bg-gold-500/15 text-gold-600" : "bg-paper-100 text-text-muted"}`}>{j.status.replaceAll("_", " ")}</span></td>
                      <td>{j.status === "DRAFT" && <button onClick={() => handleRequestPosting(j.id)} className="btn-text text-gold-600">Request posting</button>}</td>
                    </tr>
                  ))}
                  {journals.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No journals created.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "periods" && (
          <>
            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <form onSubmit={handleCreateFiscalYear} className="card p-4">
                <div className="font-medium text-[13px] text-text-900 mb-2">New fiscal year</div>
                <input required placeholder="Name (e.g. FY2026)" className="input !text-[12px] mb-2" value={yearForm.name} onChange={(e) => setYearForm((f) => ({ ...f, name: e.target.value }))} />
                <input required type="date" className="input !text-[12px] mb-2" value={yearForm.startDate} onChange={(e) => setYearForm((f) => ({ ...f, startDate: e.target.value }))} />
                <input required type="date" className="input !text-[12px] mb-2" value={yearForm.endDate} onChange={(e) => setYearForm((f) => ({ ...f, endDate: e.target.value }))} />
                <button type="submit" disabled={busy} className="btn-text text-gold-600">Create</button>
              </form>
              <form onSubmit={handleCreatePeriod} className="card p-4">
                <div className="font-medium text-[13px] text-text-900 mb-2">New period</div>
                <select required className="input !text-[12px] mb-2" value={periodForm.fiscalYearId} onChange={(e) => setPeriodForm((f) => ({ ...f, fiscalYearId: e.target.value }))}>
                  <option value="">Fiscal year…</option>
                  {fiscalYears.map((y: any) => (<option key={y.id} value={y.id}>{y.name}</option>))}
                </select>
                <input required placeholder="Name (e.g. January 2026)" className="input !text-[12px] mb-2" value={periodForm.name} onChange={(e) => setPeriodForm((f) => ({ ...f, name: e.target.value }))} />
                <input required type="date" className="input !text-[12px] mb-2" value={periodForm.startDate} onChange={(e) => setPeriodForm((f) => ({ ...f, startDate: e.target.value }))} />
                <input required type="date" className="input !text-[12px] mb-2" value={periodForm.endDate} onChange={(e) => setPeriodForm((f) => ({ ...f, endDate: e.target.value }))} />
                <button type="submit" disabled={busy} className="btn-text text-gold-600">Create</button>
              </form>
            </div>

            {fiscalYears.map((y: any) => (
              <div key={y.id} className="card p-5 mb-4">
                <div className="font-display font-semibold text-base text-ink-900 mb-3">{y.name}</div>
                <table className="w-full text-sm table-modern">
                  <thead><tr><th>Period</th><th>Dates</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {(y.periods || []).map((p: any) => (
                      <tr key={p.id}>
                        <td className="text-text-900 font-medium">{p.name}</td>
                        <td className="text-text-700 text-[12.5px]">{new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}</td>
                        <td><span className={`badge ${p.status === "OPEN" ? "bg-green-100 text-green-600" : p.status === "LOCKED" ? "bg-rose-100 text-rose-600" : "bg-paper-100 text-text-muted"}`}>{p.status}</span></td>
                        <td className="whitespace-nowrap space-x-2">
                          {p.status === "OPEN" && <button onClick={() => handlePeriodAction(p.id, "close")} className="btn-text text-gold-600">Close</button>}
                          {p.status === "CLOSED" && <button onClick={() => handlePeriodAction(p.id, "reopen")} className="btn-text text-green-600">Request reopen</button>}
                          {p.status === "CLOSED" && <button onClick={() => handlePeriodAction(p.id, "lock")} className="btn-text text-rose-600">Lock</button>}
                        </td>
                      </tr>
                    ))}
                    {(!y.periods || y.periods.length === 0) && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-4">No periods yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            ))}
            {fiscalYears.length === 0 && <p className="text-text-muted text-sm text-center py-8">No fiscal years created.</p>}
          </>
        )}
        {tab === "recurring" && (
          <>
            <form onSubmit={handleCreateRecurring} className="card p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <input required placeholder="Description" className="input" value={recurringForm.description} onChange={(e) => setRecurringForm((f) => ({ ...f, description: e.target.value }))} />
                <select className="input" value={recurringForm.frequency} onChange={(e) => setRecurringForm((f) => ({ ...f, frequency: e.target.value }))}>
                  {["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY", "CUSTOM"].map((fr) => (<option key={fr} value={fr}>{fr}</option>))}
                </select>
                <input required type="date" className="input" value={recurringForm.startDate} onChange={(e) => setRecurringForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              {recurringForm.frequency === "CUSTOM" && (
                <input required type="number" min="1" placeholder="Every N days" className="input mb-3 !w-40" value={recurringForm.customIntervalDays} onChange={(e) => setRecurringForm((f) => ({ ...f, customIntervalDays: e.target.value }))} />
              )}
              {recurringForm.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                  <select required className="input !py-1.5" value={l.accountId} onChange={(e) => updateRecurringLine(i, "accountId", e.target.value)}>
                    <option value="">Account…</option>
                    {accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
                  </select>
                  <input type="number" step="0.01" placeholder="Debit" className="input !py-1.5" value={l.debit} onChange={(e) => updateRecurringLine(i, "debit", e.target.value)} />
                  <input type="number" step="0.01" placeholder="Credit" className="input !py-1.5" value={l.credit} onChange={(e) => updateRecurringLine(i, "credit", e.target.value)} />
                </div>
              ))}
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setRecurringForm((f) => ({ ...f, lines: [...f.lines, { accountId: "", debit: "", credit: "" }] }))} className="btn-text text-gold-600">+ Add line</button>
                {recurringForm.lines.length > 2 && <button type="button" onClick={() => setRecurringForm((f) => ({ ...f, lines: f.lines.slice(0, -1) }))} className="btn-text text-rose-600">Remove last</button>}
              </div>
              <button type="submit" disabled={busy} className="btn-primary">Create template (as Draft)</button>
            </form>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Description</th><th>Frequency</th><th>Next run</th><th>Failures</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {recurringJournals.map((rj: any) => (
                    <tr key={rj.id}>
                      <td className="text-text-900">{rj.description}</td>
                      <td className="text-text-700">{rj.frequency}{rj.frequency === "CUSTOM" ? ` (${rj.customIntervalDays}d)` : ""}</td>
                      <td className="text-text-700">{new Date(rj.nextExecutionDate).toLocaleDateString()}</td>
                      <td className="text-text-700">{rj.consecutiveFailures}/{rj.maxRetries}</td>
                      <td><span className={`badge ${rj.status === "ACTIVE" ? "bg-green-100 text-green-600" : rj.status === "SUSPENDED" ? "bg-rose-100 text-rose-600" : rj.status === "PENDING_APPROVAL" ? "bg-gold-500/15 text-gold-600" : "bg-paper-100 text-text-muted"}`}>{rj.status.replaceAll("_", " ")}</span></td>
                      <td className="whitespace-nowrap space-x-2">
                        {rj.status === "DRAFT" && <button onClick={() => handleRecurringAction(rj.id, "activate")} className="btn-text text-gold-600">Request activation</button>}
                        {rj.status === "ACTIVE" && <button onClick={() => handleRecurringAction(rj.id, "suspend")} className="btn-text text-rose-600">Suspend</button>}
                        {rj.status === "SUSPENDED" && <button onClick={() => handleRecurringAction(rj.id, "reactivate")} className="btn-text text-green-600">Reactivate</button>}
                      </td>
                    </tr>
                  ))}
                  {recurringJournals.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No recurring journals.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
