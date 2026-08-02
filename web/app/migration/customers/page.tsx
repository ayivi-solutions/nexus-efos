"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

type RowStatus = "valid" | "error" | "duplicate";
interface RowResult {
  rowNumber: number;
  sheet: string;
  data: Record<string, string>;
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
  const [dryRun, setDryRun] = useState<{ summary: any; customerResults: RowResult[]; nokResults: RowResult[]; beneResults: RowResult[]; boResults: RowResult[] } | null>(null);
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
    setDryRun(null);
    setCommitResult(null);
    setResolutions({});
  }

  async function handleDryRun() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const res = await api.dryRunCustomerImport(file);
      setDryRun(res);
      const defaults: Record<string, "skip" | "update"> = {};
      res.customerResults.filter((r: RowResult) => r.status === "duplicate").forEach((r: RowResult) => { defaults[r.data.phone] = "skip"; });
      setResolutions(defaults);
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
      const res = await api.commitCustomerImport(file, resolutions);
      setCommitResult(res);
      toast.success(`Import complete — ${res.successRows} record(s) created/updated.`);
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  const allResults = dryRun ? [...dryRun.customerResults, ...dryRun.nokResults, ...dryRun.beneResults, ...dryRun.boResults] : [];
  const hasBlockingErrors = allResults.some((r) => r.status === "error");

  return (
    <AppShell active="Migration">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex gap-2 mb-6">
          <a href="/migration/customers" className="btn-text text-gold-600 font-semibold">Customers</a>
          <a href="/migration/savings" className="btn-text text-text-muted">Savings</a>
          <a href="/migration/loans" className="btn-text text-text-muted">Loans</a>
          <a href="/migration/history" className="btn-text text-text-muted">History</a>
        </div>

        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Customer Data Migration</h1>
        <p className="text-text-muted text-sm mb-6">Bulk-onboard an existing company's customers, next of kin, beneficiaries, and beneficial owners. Nothing is written until you explicitly commit.</p>

        <div className="card p-6 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-3">1. Get the template</h2>
          <button onClick={handleDownloadTemplate} className="btn-dark">Download Excel template</button>
          <p className="text-text-muted text-xs mt-2">A 5-sheet workbook: Instructions, Customers, Next of Kin, Beneficiaries, and Beneficial Owners. Read the Instructions sheet first — it explains every field and how the linked sheets connect back to a customer by phone number.</p>
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
              <SheetSummary label="Customers" s={dryRun.summary.customers} />
              <SheetSummary label="Next of Kin" s={dryRun.summary.nextOfKin} />
              <SheetSummary label="Beneficiaries" s={dryRun.summary.beneficiaries} />
              <SheetSummary label="Beneficial Owners" s={dryRun.summary.beneficialOwners} />
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[760px] text-sm table-modern">
                <thead><tr><th>Sheet</th><th>Row</th><th>Name</th><th>Status</th><th>Detail</th></tr></thead>
                <tbody>
                  {allResults.map((r, i) => (
                    <tr key={i}>
                      <td className="text-text-muted text-[12px]">{r.sheet}</td>
                      <td className="text-text-700">{r.rowNumber}</td>
                      <td className="text-text-900">{r.data.fullName}</td>
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
            <p className="text-text-700 text-sm">{commitResult.successRows} record(s) created or updated, {commitResult.skipped} skipped.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SheetSummary({ label, s }: { label: string; s: any }) {
  return (
    <div className="card p-3.5">
      <div className="font-display font-semibold text-sm text-ink-900 mb-1.5">{label}</div>
      <div className="flex gap-3 text-[11.5px]">
        <span className="text-text-muted">{s.total} rows</span>
        {s.valid > 0 && <span className="text-green-600">{s.valid} ready</span>}
        {s.duplicate > 0 && <span className="text-gold-600">{s.duplicate} existing</span>}
        {s.error > 0 && <span className="text-rose-600">{s.error} error</span>}
      </div>
    </div>
  );
}
