"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const STATUS_STYLE: Record<string, string> = {
  DRY_RUN: "bg-violet-500/15 text-violet-500",
  COMMITTED: "bg-green-100 text-green-600",
  FAILED: "bg-rose-100 text-rose-600",
  REVERSED: "bg-paper-100 text-text-muted",
};

export default function MigrationHistoryPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [batches, setBatches] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api.listImportBatches().then((res) => setBatches(res.batches)).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);

  async function handleUndo(batch: any) {
    if (!window.confirm(`Reverse this ${batch.entityType.replace("_", " ").toLowerCase()} import (${batch.successRows} record(s))? This removes them from active use immediately and cannot be undone from this screen.`)) return;
    setBusyId(batch.id);
    setError(null);
    try {
      const res = await api.undoImportBatch(batch.id);
      toast.success(`Batch reversed — ${res.affectedCount} record(s) removed from active use.`);
      load();
    } catch (err: any) {
      setError(err.message || "Could not reverse this batch");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell active="Migration">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex gap-2 mb-6">
          <a href="/migration/customers" className="btn-text text-text-muted">Customers</a>
          <a href="/migration/savings" className="btn-text text-text-muted">Savings</a>
          <a href="/migration/loans" className="btn-text text-text-muted">Loans</a>
          <a href="/migration/history" className="btn-text text-gold-600 font-semibold">History</a>
        </div>

        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Import History</h1>
        <p className="text-text-muted text-sm mb-6">Every migration batch, traceable and reversible. Undo is a genuine removal from active use — not a normal close/archive — since it exists to correct a bad import, including ones with real balances that were simply wrong.</p>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm table-modern">
            <thead><tr><th>Date</th><th>File</th><th>Type</th><th>Method</th><th>Rows</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="text-text-700 text-[12.5px]">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="text-text-900 font-mono text-[12px]">{b.fileName}</td>
                  <td className="text-text-700">{b.entityType.replaceAll("_", " ")}</td>
                  <td className="text-text-700">{b.method.replaceAll("_", " ")}</td>
                  <td className="text-text-700">{b.successRows} / {b.totalRows}</td>
                  <td><span className={`badge ${STATUS_STYLE[b.status] || ""}`}>{b.status.replaceAll("_", " ")}</span></td>
                  <td>
                    {b.status === "COMMITTED" && (
                      <button onClick={() => handleUndo(b)} disabled={busyId === b.id} className="btn-text text-rose-600">
                        {busyId === b.id ? "Reversing…" : "Undo"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {batches.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No import batches yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
