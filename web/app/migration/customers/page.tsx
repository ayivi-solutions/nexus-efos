"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

type RowStatus = "valid" | "error" | "duplicate";
interface RowResult {
  rowNumber: number;
  data: { fullName: string; phone: string; email: string; segment: string; idType: string; idNumber: string; riskRating: string };
  status: RowStatus;
  errors: string[];
  existingCustomerId?: string;
}

const STATUS_STYLE: Record<RowStatus, string> = {
  valid: "bg-green-100 text-green-600",
  error: "bg-rose-100 text-rose-600",
  duplicate: "bg-gold-500/15 text-gold-600",
};

export default function CustomerMigrationPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ summary: any; results: RowResult[] } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "skip" | "update">>({});
  const [commitResult, setCommitResult] = useState<any>(null);

  async function handleDownloadTemplate() {
    try {
      await api.downloadCustomerImportTemplate();
    } catch (err: any) {
      setError(err.message || "Could not download template");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setDryRunResult(null);
    setCommitResult(null);
    setResolutions({});
  }

  async function handleDryRun() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const res = await api.dryRunCustomerImport(file);
      setDryRunResult(res);
      const defaults: Record<string, "skip" | "update"> = {};
      res.results.filter((r: RowResult) => r.status === "duplicate").forEach((r: RowResult) => { defaults[r.data.phone] = "skip"; });
      setResolutions(defaults);
    } catch (err: any) {
      setError(err.message || "Dry-run failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!file || !dryRunResult) return;
    setBusy(true); setError(null);
    try {
      const res = await api.commitCustomerImport(file, resolutions);
      setCommitResult(res);
      toast.success(`Import complete — ${res.successRows} customer(s) created/updated.`);
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  const hasBlockingErrors = dryRunResult?.results.some((r) => r.status === "error") ?? false;

  return (
    <AppShell active="Migration">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Customer Data Migration</h1>
        <p className="text-text-muted text-sm mb-6">Bulk-onboard an existing company's customers. Nothing is written until you explicitly commit — a dry-run only validates.</p>

        <div className="card p-6 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-3">1. Get the template</h2>
          <button onClick={handleDownloadTemplate} className="btn-dark">Download Excel template</button>
          <p className="text-text-muted text-xs mt-2">Phone number is what the system uses to detect a customer who already exists — it must be unique within your file.</p>
        </div>

        <div className="card p-6 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-3">2. Upload the completed file</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xlsx" onChange={handleFileChange} className="input !py-1.5 file:mr-3 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-gold-500/15 file:text-gold-600 file:text-[12px]" />
            <button onClick={handleDryRun} disabled={!file || busy} className="btn-primary">{busy ? "Checking…" : "Run dry-run check"}</button>
          </div>
        </div>

        {dryRunResult && (
          <div className="card p-6 mb-6">
            <h2 className="font-display font-semibold text-base text-ink-900 mb-4">3. Review results</h2>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-5">
              <Stat label="Total rows" value={String(dryRunResult.summary.totalRows)} />
              <Stat label="Ready to import" value={String(dryRunResult.summary.validCount)} color="text-green-600" />
              <Stat label="Existing matches" value={String(dryRunResult.summary.duplicateCount)} color="text-gold-600" />
              <Stat label="Errors" value={String(dryRunResult.summary.errorCount)} color="text-rose-600" />
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>Status</th><th>Detail</th></tr></thead>
                <tbody>
                  {dryRunResult.results.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="text-text-700">{r.rowNumber}</td>
                      <td className="text-text-900">{r.data.fullName}</td>
                      <td className="text-text-700 font-mono">{r.data.phone}</td>
                      <td><span className={`badge ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                      <td className="text-text-700 text-[12.5px]">
                        {r.status === "error" && r.errors.join("; ")}
                        {r.status === "duplicate" && (
                          <select
                            className="input !py-1 !text-[12px]"
                            value={resolutions[r.data.phone] || "skip"}
                            onChange={(e) => setResolutions((res) => ({ ...res, [r.data.phone]: e.target.value as "skip" | "update" }))}
                          >
                            <option value="skip">Skip — keep existing record as-is</option>
                            <option value="update">Update existing record with this row's data</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasBlockingErrors ? (
              <p className="text-rose-600 text-sm">Fix the errors above in your source file, then re-upload and re-run the dry-run — commit is disabled while any row has an error.</p>
            ) : (
              <button onClick={handleCommit} disabled={busy} className="btn-primary">{busy ? "Importing…" : "Commit import"}</button>
            )}
          </div>
        )}

        {commitResult && (
          <div className="card p-6 bg-green-100/40 border-green-600/30">
            <h2 className="font-display font-semibold text-base text-ink-900 mb-2">Import complete</h2>
            <p className="text-text-700 text-sm">{commitResult.successRows} customer(s) created or updated, {commitResult.skipped} skipped.</p>
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
