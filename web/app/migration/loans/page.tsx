"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

type Method = "opening-balance" | "full-history";
type RowStatus = "valid" | "error";
interface RowResult { rowNumber: number; sheet: string; data: Record<string, string>; status: RowStatus; errors: string[]; }

const STATUS_STYLE: Record<RowStatus, string> = { valid: "bg-green-100 text-green-600", error: "bg-rose-100 text-rose-600" };

export default function LoanMigrationPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [method, setMethod] = useState<Method>("opening-balance");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState<any>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  function switchMethod(m: Method) {
    setMethod(m);
    setFile(null);
    setDryRun(null);
    setCommitResult(null);
  }

  async function handleDownloadTemplate() {
    try {
      if (method === "opening-balance") await api.downloadLoanOpeningBalanceTemplate();
      else await api.downloadLoanFullHistoryTemplate();
    } catch (err: any) {
      setError(err.message || "Could not download template");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setDryRun(null);
    setCommitResult(null);
  }

  async function handleDryRun() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const res = method === "opening-balance" ? await api.dryRunLoanOpeningBalance(file) : await api.dryRunLoanFullHistory(file);
      setDryRun(res);
    } catch (err: any) {
      setError(err.message || "Dry-run failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!file || !dryRun) return;
    setBusy(true); setError(null);
    try {
      const res = method === "opening-balance" ? await api.commitLoanOpeningBalance(file) : await api.commitLoanFullHistory(file);
      setCommitResult(res);
      toast.success(`Import complete — ${res.successRows} loan(s) created.`);
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  const allResults: RowResult[] = dryRun
    ? method === "opening-balance"
      ? dryRun.results
      : [...dryRun.headerResults, ...dryRun.repaymentResults]
    : [];
  const hasBlockingErrors = allResults.some((r) => r.status === "error");
  const summaryStats = dryRun
    ? method === "opening-balance"
      ? [{ label: "Loans", ...dryRun.summary }]
      : [{ label: "Loan Headers", ...dryRun.summary.headers }, { label: "Repayment History", ...dryRun.summary.repayments }]
    : [];

  return (
    <AppShell active="Migration">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex gap-2 mb-6">
          <a href="/migration/customers" className="btn-text text-text-muted">Customers</a>
          <a href="/migration/savings" className="btn-text text-text-muted">Savings</a>
          <a href="/migration/loans" className="btn-text text-gold-600 font-semibold">Loans</a>
        </div>

        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Loan Migration</h1>
        <p className="text-text-muted text-sm mb-6">Bulk-import existing loans. Customers must already exist in Nexus.</p>

        <div className="card p-5 mb-6">
          <span className="block text-[13px] text-text-500 mb-2">Which method fits your data?</span>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => switchMethod("opening-balance")} className={`flex-1 text-left p-4 rounded-[10px] border transition ${method === "opening-balance" ? "border-gold-500 bg-gold-500/10" : "border-paper-100"}`}>
              <div className="font-display font-semibold text-sm text-ink-900 mb-1">Opening Balance</div>
              <div className="text-text-muted text-[12.5px]">Simple, clean start — record what's owed today and generate a fresh schedule going forward. No prior payment history in Nexus.</div>
            </button>
            <button onClick={() => switchMethod("full-history")} className={`flex-1 text-left p-4 rounded-[10px] border transition ${method === "full-history" ? "border-gold-500 bg-gold-500/10" : "border-paper-100"}`}>
              <div className="font-display font-semibold text-sm text-ink-900 mb-1">Full History</div>
              <div className="text-text-muted text-[12.5px]">Complete record from original disbursement — every historical payment replayed in order. Needs 2 linked sheets (loan headers + repayment history).</div>
            </button>
          </div>
        </div>

        <div className="card p-6 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-3">1. Get the template</h2>
          <button onClick={handleDownloadTemplate} className="btn-dark">Download Excel template</button>
        </div>

        <div className="card p-6 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-3">2. Upload the completed file</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xlsx" onChange={handleFileChange} className="input !py-1.5 file:mr-3 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-gold-500/15 file:text-gold-600 file:text-[12px]" />
            <button onClick={handleDryRun} disabled={!file || busy} className="btn-primary">{busy ? "Checking…" : "Run dry-run check"}</button>
          </div>
        </div>

        {dryRun && (
          <div className="card p-6 mb-6">
            <h2 className="font-display font-semibold text-base text-ink-900 mb-4">3. Review results</h2>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-5">
              {summaryStats.map((s: any, i: number) => (
                <div key={i} className="card p-3.5">
                  <div className="font-display font-semibold text-sm text-ink-900 mb-1.5">{s.label}</div>
                  <div className="flex gap-3 text-[11.5px]">
                    <span className="text-text-muted">{s.total} rows</span>
                    <span className="text-green-600">{s.valid} ready</span>
                    {s.error > 0 && <span className="text-rose-600">{s.error} error</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Sheet</th><th>Row</th><th>Status</th><th>Detail</th></tr></thead>
                <tbody>
                  {allResults.map((r, i) => (
                    <tr key={i}>
                      <td className="text-text-muted text-[12px]">{r.sheet}</td>
                      <td className="text-text-700">{r.rowNumber}</td>
                      <td><span className={`badge ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                      <td className="text-text-700 text-[12.5px]">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasBlockingErrors ? (
              <p className="text-rose-600 text-sm">Fix the errors above, re-upload, and re-run the dry-run — commit is disabled while any row has an error.</p>
            ) : (
              <button onClick={handleCommit} disabled={busy} className="btn-primary">{busy ? "Importing…" : "Commit import"}</button>
            )}
          </div>
        )}

        {commitResult && (
          <div className="card p-6 bg-green-100/40 border-green-600/30">
            <h2 className="font-display font-semibold text-base text-ink-900 mb-2">Import complete</h2>
            <p className="text-text-700 text-sm">{commitResult.successRows} loan(s) created.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
