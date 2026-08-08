"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";
import { ReportRangeSelector } from "@/components/ReportRangeSelector";

const CATEGORIES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export default function GeneralLedgerPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"accounts" | "journals" | "periods" | "recurring" | "statements" | "glreports" | "regulatory">("accounts");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [accountForm, setAccountForm] = useState({ code: "", name: "", category: "ASSET" });
  const [journalForm, setJournalForm] = useState({ description: "", postingDate: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [yearForm, setYearForm] = useState({ name: "", startDate: "", endDate: "" });
  const [periodForm, setPeriodForm] = useState({ fiscalYearId: "", name: "", startDate: "", endDate: "" });
  const [recurringJournals, setRecurringJournals] = useState<any[]>([]);
  const [recurringForm, setRecurringForm] = useState({ description: "", frequency: "MONTHLY", customIntervalDays: "", startDate: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
  const [statementType, setStatementType] = useState<"trial-balance" | "balance-sheet" | "income-statement" | "changes-in-equity">("trial-balance");
  const [rangeId, setRangeId] = useState("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statementData, setStatementData] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [activityAccountId, setActivityAccountId] = useState("");
  const [activityRange, setActivityRange] = useState("THIS_MONTH");
  const [activityCustomFrom, setActivityCustomFrom] = useState("");
  const [activityCustomTo, setActivityCustomTo] = useState("");
  const [activityData, setActivityData] = useState<any>(null);
  const [byBranch, setByBranch] = useState<any>(null);
  const [byPeriod, setByPeriod] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [nplRatio, setNplRatio] = useState<any>(null);
  const [liquidityRatio, setLiquidityRatio] = useState<any>(null);
  const [bogSummary, setBogSummary] = useState<any>(null);

  function loadRegulatory() {
    api.getCashFlowStatement("THIS_YEAR").then(setCashFlow).catch(() => {});
    api.getNplRatio().then(setNplRatio).catch(() => {});
    api.getLiquidityRatio().then(setLiquidityRatio).catch(() => {});
    api.getBogPublicationSummary().then(setBogSummary).catch(() => {});
  }

  async function loadGLReports() {
    api.getGLDashboard().then(setDashboard).catch(() => {});
    api.getGLByBranch("THIS_YEAR").then(setByBranch).catch(() => {});
    api.getGLByPeriod().then(setByPeriod).catch(() => {});
  }

  async function loadAccountActivity() {
    if (!activityAccountId) return;
    if (activityRange === "CUSTOM" && (!activityCustomFrom || !activityCustomTo)) return;
    try {
      const data = await api.getAccountActivity(activityAccountId, activityRange, activityCustomFrom || undefined, activityCustomTo || undefined);
      setActivityData(data);
    } catch (err: any) { setError(err.message || "Could not load account activity"); }
  }

  useEffect(() => { if (tab === "glreports") loadGLReports(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "regulatory") loadRegulatory(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadAccountActivity(); }, [activityAccountId, activityRange, activityCustomFrom, activityCustomTo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStatement() {
    if (rangeId === "CUSTOM" && (!customFrom || !customTo)) return;
    setStatementLoading(true); setError(null);
    try {
      const fn = statementType === "trial-balance" ? api.getTrialBalance : statementType === "balance-sheet" ? api.getBalanceSheet : statementType === "income-statement" ? api.getIncomeStatement : api.getChangesInEquity;
      const data = await fn(rangeId, customFrom || undefined, customTo || undefined);
      setStatementData(data);
    } catch (err: any) { setError(err.message || "Could not load statement"); } finally { setStatementLoading(false); }
  }

  useEffect(() => { if (tab === "statements") loadStatement(); }, [tab, statementType, rangeId, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <button onClick={() => setTab("statements")} className={`btn-text ${tab === "statements" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Financial Statements</button>
          <button onClick={() => setTab("glreports")} className={`btn-text ${tab === "glreports" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>GL Reports</button>
          <button onClick={() => setTab("regulatory")} className={`btn-text ${tab === "regulatory" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Regulatory Reporting</button>
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
              <table className="w-full min-w-[820px] text-sm table-modern">
                <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Balance</th><th>Status</th><th>Cash Flow</th><th>Liquid?</th><th>Volatile Liab?</th><th>Capital Tier</th><th>Basel RW%</th><th></th></tr></thead>
                <tbody>
                  {accounts.map((a: any) => (
                    <tr key={a.id}>
                      <td className="font-mono text-[12px] text-text-700">{a.code}</td>
                      <td className="text-text-900 font-medium">{a.name}</td>
                      <td className="text-text-700">{a.category}</td>
                      <td className="text-text-700">GHS {Number(a.balance).toLocaleString()}</td>
                      <td><span className={`badge ${a.status === "ACTIVE" ? "bg-green-100 text-green-600" : "bg-paper-100 text-text-muted"}`}>{a.status}</span></td>
                      <td>
                        <select className="input !py-1 !text-[11px]" value={a.cashFlowActivity || ""} onChange={(e) => api.classifyGLAccount(a.id, { cashFlowActivity: e.target.value || undefined, isLiquidAsset: a.isLiquidAsset, isVolatileLiability: a.isVolatileLiability, capitalTier: a.capitalTier, baselRiskWeightPercent: a.baselRiskWeightPercent }).then(load)}>
                          <option value="">—</option><option value="OPERATING">Operating</option><option value="INVESTING">Investing</option><option value="FINANCING">Financing</option>
                        </select>
                      </td>
                      <td className="text-center"><input type="checkbox" checked={!!a.isLiquidAsset} onChange={(e) => api.classifyGLAccount(a.id, { cashFlowActivity: a.cashFlowActivity, isLiquidAsset: e.target.checked, isVolatileLiability: a.isVolatileLiability, capitalTier: a.capitalTier, baselRiskWeightPercent: a.baselRiskWeightPercent }).then(load)} /></td>
                      <td className="text-center"><input type="checkbox" checked={!!a.isVolatileLiability} onChange={(e) => api.classifyGLAccount(a.id, { cashFlowActivity: a.cashFlowActivity, isLiquidAsset: a.isLiquidAsset, isVolatileLiability: e.target.checked, capitalTier: a.capitalTier, baselRiskWeightPercent: a.baselRiskWeightPercent }).then(load)} /></td>
                      <td>
                        <select className="input !py-1 !text-[11px]" title="BOG CRD 2018 §73 — which regulatory capital tier this account counts toward" value={a.capitalTier || ""} onChange={(e) => api.classifyGLAccount(a.id, { cashFlowActivity: a.cashFlowActivity, isLiquidAsset: a.isLiquidAsset, isVolatileLiability: a.isVolatileLiability, capitalTier: e.target.value || undefined, baselRiskWeightPercent: a.baselRiskWeightPercent }).then(load)}>
                          <option value="">—</option><option value="CET1">CET1</option><option value="ADDITIONAL_TIER1">Additional Tier 1</option><option value="TIER2">Tier 2</option>
                        </select>
                      </td>
                      <td>
                        {a.category === "ASSET" ? (
                          <input type="number" min={0} max={200} step={5} className="input !py-1 !w-16 !text-[11px]" placeholder="100" title="BOG CRD 2018 Table 2A — risk weight % for this asset (loans are computed automatically, this is for other assets: cash, bank balances, fixed assets, etc.)" value={a.baselRiskWeightPercent ?? ""} onChange={(e) => api.classifyGLAccount(a.id, { cashFlowActivity: a.cashFlowActivity, isLiquidAsset: a.isLiquidAsset, isVolatileLiability: a.isVolatileLiability, capitalTier: a.capitalTier, baselRiskWeightPercent: e.target.value === "" ? undefined : Number(e.target.value) }).then(load)} />
                        ) : "—"}
                      </td>
                      <td><button onClick={() => handleToggleAccount(a.id, a.status)} className="btn-text text-gold-600">{a.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td>
                    </tr>
                  ))}
                  {accounts.length === 0 && <tr><td colSpan={11} className="text-center text-text-muted text-sm py-8">No accounts created.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-text-muted mt-2">Cash Flow / Liquid / Volatile Liability classification feeds the Regulatory Reporting tab — see there for the Cash Flow Statement and Liquidity Ratio.</p>
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
        {tab === "statements" && (
          <>
            <div className="flex flex-wrap items-end gap-3 mb-6">
              <select className="input" value={statementType} onChange={(e) => setStatementType(e.target.value as any)}>
                <option value="trial-balance">Trial Balance</option>
                <option value="balance-sheet">Statement of Financial Position</option>
                <option value="income-statement">Statement of Comprehensive Income</option>
                <option value="changes-in-equity">Statement of Changes in Equity</option>
              </select>
              <ReportRangeSelector value={rangeId} onChange={setRangeId} customFrom={customFrom} customTo={customTo} onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />
            </div>

            {statementLoading && <p className="text-text-muted text-sm py-8 text-center">Loading…</p>}

            {!statementLoading && statementData && statementType === "trial-balance" && (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm table-modern">
                  <thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
                  <tbody>
                    {statementData.rows.map((r: any) => (
                      <tr key={r.code}><td className="font-mono text-[12px] text-text-700">{r.code}</td><td className="text-text-900">{r.name}</td><td className="text-text-700">{r.debit ? `GHS ${r.debit.toLocaleString()}` : ""}</td><td className="text-text-700">{r.credit ? `GHS ${r.credit.toLocaleString()}` : ""}</td></tr>
                    ))}
                    <tr className="font-semibold"><td colSpan={2} className="text-text-900">Total</td><td className="text-text-900">GHS {statementData.totalDebit.toLocaleString()}</td><td className="text-text-900">GHS {statementData.totalCredit.toLocaleString()}</td></tr>
                  </tbody>
                </table>
                <div className={`p-3 text-[12.5px] ${statementData.balanced ? "text-green-600" : "text-rose-600"}`}>{statementData.balanced ? "✓ Balanced" : "✗ Not balanced — investigate before relying on this statement"}</div>
              </div>
            )}

            {!statementLoading && statementData && statementType === "balance-sheet" && (
              <div className="grid grid-cols-1 dt:grid-cols-3 gap-4">
                <div className="card p-5">
                  <div className="font-medium text-[13px] text-text-900 mb-2">Assets</div>
                  {statementData.assets.map((a: any) => (<div key={a.code} className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>{a.name}</span><span>GHS {a.balance.toLocaleString()}</span></div>))}
                  <div className="flex justify-between font-semibold text-text-900 border-t border-paper-100 pt-1 mt-2"><span>Total</span><span>GHS {statementData.totalAssets.toLocaleString()}</span></div>
                </div>
                <div className="card p-5">
                  <div className="font-medium text-[13px] text-text-900 mb-2">Liabilities</div>
                  {statementData.liabilities.map((a: any) => (<div key={a.code} className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>{a.name}</span><span>GHS {a.balance.toLocaleString()}</span></div>))}
                  <div className="flex justify-between font-semibold text-text-900 border-t border-paper-100 pt-1 mt-2"><span>Total</span><span>GHS {statementData.totalLiabilities.toLocaleString()}</span></div>
                </div>
                <div className="card p-5">
                  <div className="font-medium text-[13px] text-text-900 mb-2">Equity</div>
                  {statementData.equity.map((a: any) => (<div key={a.code} className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>{a.name}</span><span>GHS {a.balance.toLocaleString()}</span></div>))}
                  <div className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>Net Income (since inception)</span><span>GHS {statementData.netIncomeSinceInception.toLocaleString()}</span></div>
                  <div className="flex justify-between font-semibold text-text-900 border-t border-paper-100 pt-1 mt-2"><span>Total</span><span>GHS {statementData.totalEquity.toLocaleString()}</span></div>
                </div>
                <div className={`dt:col-span-3 text-[12.5px] ${statementData.balanced ? "text-green-600" : "text-rose-600"}`}>{statementData.balanced ? "✓ Assets = Liabilities + Equity" : "✗ Does not balance — investigate before relying on this statement"}</div>
              </div>
            )}

            {!statementLoading && statementData && statementType === "income-statement" && (
              <div className="grid grid-cols-1 dt:grid-cols-2 gap-4">
                <div className="card p-5">
                  <div className="font-medium text-[13px] text-text-900 mb-2">Income</div>
                  {statementData.income.map((a: any) => (<div key={a.code} className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>{a.name}</span><span>GHS {a.amount.toLocaleString()}</span></div>))}
                  <div className="flex justify-between font-semibold text-text-900 border-t border-paper-100 pt-1 mt-2"><span>Total</span><span>GHS {statementData.totalIncome.toLocaleString()}</span></div>
                </div>
                <div className="card p-5">
                  <div className="font-medium text-[13px] text-text-900 mb-2">Expenses</div>
                  {statementData.expenses.map((a: any) => (<div key={a.code} className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>{a.name}</span><span>GHS {a.amount.toLocaleString()}</span></div>))}
                  <div className="flex justify-between font-semibold text-text-900 border-t border-paper-100 pt-1 mt-2"><span>Total</span><span>GHS {statementData.totalExpenses.toLocaleString()}</span></div>
                </div>
                <div className="dt:col-span-2 card p-5 bg-gold-500/10">
                  <div className="flex justify-between font-semibold text-ink-900"><span>Net Income</span><span>GHS {statementData.netIncome.toLocaleString()}</span></div>
                </div>
              </div>
            )}

            {!statementLoading && statementData && statementType === "changes-in-equity" && (
              <div className="card p-5 max-w-md">
                <div className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>Opening Equity</span><span>GHS {statementData.openingEquity.toLocaleString()}</span></div>
                <div className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>Net Income for Period</span><span>GHS {statementData.netIncomeForPeriod.toLocaleString()}</span></div>
                <div className="flex justify-between text-[12.5px] text-text-700 mb-1"><span>Other Equity Movement</span><span>GHS {statementData.equityMovement.toLocaleString()}</span></div>
                <div className="flex justify-between font-semibold text-text-900 border-t border-paper-100 pt-1 mt-2"><span>Closing Equity</span><span>GHS {statementData.closingEquity.toLocaleString()}</span></div>
                <div className={`text-[11px] mt-2 ${statementData.reconciles ? "text-green-600" : "text-rose-600"}`}>{statementData.reconciles ? "✓ Reconciles" : "✗ Does not reconcile — investigate"}</div>
              </div>
            )}
          </>
        )}
        {tab === "glreports" && (
          <>
            {dashboard && (
              <div className="grid grid-cols-2 dt:grid-cols-6 gap-3 mb-8">
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {dashboard.totalAssets.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase">Total Assets</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {dashboard.totalLiabilities.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase">Total Liabilities</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {dashboard.totalEquity.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase">Total Equity</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {dashboard.netIncomeSinceInception.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase">Net Income</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-rose-600">{dashboard.pendingJournals}</div><div className="text-[10.5px] text-text-muted uppercase">Pending Journals</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-text-900">{dashboard.openPeriods}</div><div className="text-[10.5px] text-text-muted uppercase">Open Periods</div></div>
              </div>
            )}

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Account Activity</h2>
            <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <select className="input" value={activityAccountId} onChange={(e) => setActivityAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
              </select>
              <ReportRangeSelector value={activityRange} onChange={setActivityRange} customFrom={activityCustomFrom} customTo={activityCustomTo} onCustomChange={(f, t) => { setActivityCustomFrom(f); setActivityCustomTo(t); }} />
            </div>
            {activityData && (
              <div className="card overflow-x-auto mb-8">
                <div className="p-3 text-[12.5px] text-text-700 border-b border-paper-100">Opening balance: GHS {activityData.openingBalance.toLocaleString()}</div>
                <table className="w-full min-w-[600px] text-sm table-modern">
                  <thead><tr><th>Date</th><th>Journal</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
                  <tbody>
                    {activityData.entries.map((e: any, i: number) => (
                      <tr key={i}>
                        <td className="text-text-700">{new Date(e.postingDate).toLocaleDateString()}</td>
                        <td className="font-mono text-[11px] text-text-700">{e.journalNumber}</td>
                        <td className="text-text-900">{e.description}</td>
                        <td className="text-text-700">{e.debit ? `GHS ${e.debit.toLocaleString()}` : ""}</td>
                        <td className="text-text-700">{e.credit ? `GHS ${e.credit.toLocaleString()}` : ""}</td>
                        <td className="text-text-900 font-medium">GHS {e.balance.toLocaleString()}</td>
                      </tr>
                    ))}
                    {activityData.entries.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-6">No activity in this period.</td></tr>}
                  </tbody>
                </table>
                <div className="p-3 text-[12.5px] text-text-900 font-medium border-t border-paper-100">Closing balance: GHS {activityData.closingBalance.toLocaleString()}</div>
              </div>
            )}

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4">
              <div>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">By Branch (this year)</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm table-modern">
                    <thead><tr><th>Branch</th><th>Accounts</th><th>Balance</th></tr></thead>
                    <tbody>
                      {(byBranch?.branches || []).map((b: any) => (<tr key={b.branchId || "u"}><td className="text-text-900">{b.branchName}</td><td className="text-text-700">{b.accountCount}</td><td className="text-text-700">GHS {b.totalBalance.toLocaleString()}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">By Period</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm table-modern">
                    <thead><tr><th>Period</th><th>Journals</th><th>Posted</th></tr></thead>
                    <tbody>
                      {(byPeriod?.periods || []).map((p: any) => (<tr key={p.periodId}><td className="text-text-900">{p.periodName}</td><td className="text-text-700">{p.journalCount}</td><td className="text-text-700">GHS {p.totalPosted.toLocaleString()}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "regulatory" && (
          <>
            <p className="text-[12.5px] text-text-muted mb-4">Built against the Bank of Ghana's own official Guide for Financial Publication. The Balance Sheet, Income Statement, Changes in Equity, and Trial Balance under Financial Statements above are also part of this. Capital Adequacy Ratio, IFRS 9 credit-loss disclosures, and GDPC returns are named, deferred gaps — see below.</p>

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-8">
              <div className="card p-5">
                <div className="text-[10.5px] text-text-muted uppercase mb-1">NPL Ratio</div>
                {nplRatio && (
                  <>
                    <div className="font-display font-semibold text-2xl text-gold-600">{nplRatio.nplRatio}%</div>
                    <div className="text-[11px] text-text-muted mt-1">{nplRatio.definition}</div>
                  </>
                )}
              </div>
              <div className="card p-5">
                <div className="text-[10.5px] text-text-muted uppercase mb-1">Liquidity Ratio</div>
                {liquidityRatio && (
                  liquidityRatio.liquidityRatio !== null ? (
                    <div className="font-display font-semibold text-2xl text-gold-600">{liquidityRatio.liquidityRatio}%</div>
                  ) : (
                    <div className="text-[12px] text-text-muted">No accounts tagged as liquid assets / volatile liabilities yet — classify accounts in Chart of Accounts.</div>
                  )
                )}
              </div>
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Cash Flow Statement (this year)</h2>
            {cashFlow && (
              <div className="card p-5 mb-8">
                <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-3">
                  <div><div className="text-[10.5px] text-text-muted uppercase">Operating</div><div className="text-text-900 font-medium">GHS {cashFlow.operating.toLocaleString()}</div></div>
                  <div><div className="text-[10.5px] text-text-muted uppercase">Investing</div><div className="text-text-900 font-medium">GHS {cashFlow.investing.toLocaleString()}</div></div>
                  <div><div className="text-[10.5px] text-text-muted uppercase">Financing</div><div className="text-text-900 font-medium">GHS {cashFlow.financing.toLocaleString()}</div></div>
                  <div><div className="text-[10.5px] text-text-muted uppercase">Net Change</div><div className="text-text-900 font-medium">GHS {cashFlow.netChange.toLocaleString()}</div></div>
                </div>
                <div className="text-[12px] text-text-700">Cash: GHS {cashFlow.cashOpening.toLocaleString()} → GHS {cashFlow.cashClosing.toLocaleString()}</div>
                <div className={`text-[12px] mt-1 ${cashFlow.reconciles ? "text-green-600" : "text-rose-600"}`}>{cashFlow.reconciles ? "✓ Reconciles" : "✗ Does not reconcile — check account classification"}</div>
              </div>
            )}

            {bogSummary && (
              <>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">What's Available vs. Deferred</h2>
                <div className="card p-5 mb-4">
                  <div className="font-medium text-[12.5px] text-green-600 mb-2">Available</div>
                  <ul className="text-[12.5px] text-text-700 list-disc list-inside space-y-0.5">
                    {bogSummary.available.map((a: string, i: number) => (<li key={i}>{a}</li>))}
                  </ul>
                </div>
                <div className="card p-5 bg-gold-500/10">
                  <div className="font-medium text-[12.5px] text-ink-900 mb-2">Deferred, named honestly</div>
                  <div className="space-y-2">
                    {bogSummary.deferred.map((d: any, i: number) => (
                      <div key={i}>
                        <div className="text-[12.5px] font-medium text-text-900">{d.item}</div>
                        <div className="text-[11.5px] text-text-muted">{d.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
