"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

type RowStatus = "valid" | "error";
interface RowResult {
  rowNumber: number;
  sheet: string;
  data: { customerPhone: string; productCode: string; accountNumber: string; openingBalance: string; status: string };
  status: RowStatus;
  errors: string[];
}

const STATUS_STYLE: Record<RowStatus, string> = {
  valid: "bg-green-100 text-green-600",
  error: "bg-rose-100 text-rose-600",
};

export default function SavingsMigrationPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState<{ summary: any; results: RowResult[] } | null>(null);
  const [commitResult, setCommitResult] = useState<any>(null);

  async function handleDownloadTemplate() {
    try {
      await api.downloadSavingsImportTemplate();
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
      setDryRun(await api.dryRunSavingsImport(file));
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
      const res = await api.commitSavingsImport(file);
      setCommitResult(res);
      toast.success(`Import complete — ${res.successRows} savings account(s) created.`);
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  const hasBlockingErrors = dryRun?.results.some((r) => r.status === "error") ?? false;

  return (
    <AppShell active="Migration">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex gap-2 mb-6">
          <a href="/migration/customers" className="btn-text text-text-muted">Customers</a>
          <a href="/migration/savings" className="btn-text text-gold-600 font-semibold">Savings</a>
          <a href="/migration/loans" className="btn-text text-text-muted">Loans</a>
          <a href="/migration/history" className="btn-text text-text-muted">History</a>
        </div>

        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Savings Account Migration</h1>
        <p className="text-text-muted text-sm mb-6">Bulk-open existing savings accounts with their current balance. Customers must already exist in Nexus — run Customer migration first.</p>

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
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Stat label="Total rows" value={String(dryRun.summary.total)} />
              <Stat label="Ready to import" value={String(dryRun.summary.valid)} color="text-green-600" />
              <Stat label="Errors" value={String(dryRun.summary.error)} color="text-rose-600" />
            </div>
            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[680px] text-sm table-modern">
                <thead><tr><th>Row</th><th>Customer Phone</th><th>Product</th><th>Balance</th><th>Status</th><th>Detail</th></tr></thead>
                <tbody>
                  {dryRun.results.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="text-text-700">{r.rowNumber}</td>
                      <td className="text-text-700 font-mono">{r.data.customerPhone}</td>
                      <td className="text-text-700">{r.data.productCode}</td>
                      <td className="text-text-900">GHS {r.data.openingBalance}</td>
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
            <p className="text-text-700 text-sm">{commitResult.successRows} savings account(s) created.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, color = "text-gold-600" }: { label: string; value: string; color?: string }) {
  return (
    <div className="card p-3.5">
      <div className={`font-display font-semibold text-lg ${color}`}>{value}</div>
      <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
