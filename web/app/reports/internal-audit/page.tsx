"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { downloadCsv } from "@/lib/csv";
import { AppShell } from "@/components/AppShell";

export default function InternalAuditReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  function load() {
    api.getInternalAuditReport(from || undefined, to || undefined).then(setData).catch((err: any) => setError(err.message));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">Internal Audit Report</h1>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">From</span>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">to</span>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Apply</button>
          {data && (
            <button onClick={() => downloadCsv("internal-audit-report.csv", data.findings.list)} className="btn-primary !py-2 ml-auto">
              Export Findings CSV
            </button>
          )}
        </div>

        {data && (
          <>
            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Engagements</h2>
            <div className="card p-4 mb-6">
              <div className="font-display font-semibold text-sm text-ink-900 mb-2">By status ({data.engagements.total} total)</div>
              {Object.entries(data.engagements.byStatus).map(([name, v]: any) => (
                <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
              ))}
              {Object.keys(data.engagements.byStatus).length === 0 && <div className="text-text-muted text-[13px] py-2">No engagements in range.</div>}
            </div>

            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Findings</h2>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.findings.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total findings</div></div>
              <div className="card p-3.5"><div className={`font-display font-semibold text-lg ${data.findings.overdueRate > 10 ? "text-rose-600" : "text-green-600"}`}>{data.findings.overdueRate}%</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Overdue rate</div></div>
              <div className="card p-3.5"><div className={`font-display font-semibold text-lg ${data.findings.overdueCount > 0 ? "text-rose-600" : "text-green-600"}`}>{data.findings.overdueCount}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Overdue</div></div>
              <div className="card p-3.5"><div className={`font-display font-semibold text-lg ${data.findings.unassignedCount > 0 ? "text-gold-600" : "text-green-600"}`}>{data.findings.unassignedCount}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">No owner assigned</div></div>
            </div>

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By risk classification</div>
                {Object.entries(data.findings.byRisk).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By status</div>
                {Object.entries(data.findings.byStatus).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name}</span><span>{v}</span></div>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Ref</th><th>Risk</th><th>Status</th><th>Target Date</th><th>Recorded</th></tr></thead>
                <tbody>
                  {data.findings.list.map((f: any) => (
                    <tr key={f.id}>
                      <td className="text-text-900 font-mono text-[12px]">{f.referenceNumber}</td>
                      <td className="text-text-700">{f.riskClassification}</td>
                      <td className="text-text-700">{f.status}{f.overdue && " (overdue)"}</td>
                      <td className="text-text-muted text-[12px]">{f.targetRemediationDate ? new Date(f.targetRemediationDate).toLocaleDateString() : "—"}</td>
                      <td className="text-text-muted text-[12px]">{new Date(f.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.findings.list.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No findings.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
