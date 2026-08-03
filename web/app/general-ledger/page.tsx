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
  const [tab, setTab] = useState<"accounts" | "journals">("accounts");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [accountForm, setAccountForm] = useState({ code: "", name: "", category: "ASSET" });
  const [journalForm, setJournalForm] = useState({ description: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
  const [busy, setBusy] = useState(false);

  function load() {
    api.listGLAccounts().then((r) => setAccounts(r.accounts)).catch((e) => setError(e.message));
    api.listJournals().then((r) => setJournals(r.journals)).catch(() => {});
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
        lines: journalForm.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      });
      toast.success("Journal created as DRAFT.");
      setJournalForm({ description: "", lines: [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }] });
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
              <input required placeholder="Description" className="input mb-3" value={journalForm.description} onChange={(e) => setJournalForm((f) => ({ ...f, description: e.target.value }))} />
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
                      <td className="text-text-900">{j.description}</td>
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
      </div>
    </AppShell>
  );
}
