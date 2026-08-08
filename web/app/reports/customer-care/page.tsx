"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { downloadCsv } from "@/lib/csv";
import { AppShell } from "@/components/AppShell";

export default function CustomerCareReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  function load() {
    api.getCustomerCareReport(from || undefined, to || undefined).then(setData).catch((err: any) => setError(err.message));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">Customer Care Report</h1>

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
            <button onClick={() => downloadCsv("customer-care-report.csv", data.complaints.list)} className="btn-primary !py-2 ml-auto">
              Export Complaints CSV
            </button>
          )}
        </div>

        {data && (
          <>
            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Interactions</h2>
            <div className="grid grid-cols-2 dt:grid-cols-3 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.interactions.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total interactions</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.interactions.followUpsScheduled}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Follow-ups scheduled</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-green-600">{data.interactions.followUpsCompleted}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Follow-ups completed</div></div>
            </div>
            <div className="card p-4 mb-6">
              <div className="font-display font-semibold text-sm text-ink-900 mb-2">By channel</div>
              {Object.entries(data.interactions.byChannel).map(([name, v]: any) => (
                <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
              ))}
              {Object.keys(data.interactions.byChannel).length === 0 && <div className="text-text-muted text-[13px] py-2">No interactions in range.</div>}
            </div>

            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Complaints</h2>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.complaints.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total complaints</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-green-600">{data.complaints.resolvedCount}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Resolved</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.complaints.avgResolutionHours}h</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Avg resolution time</div></div>
              <div className="card p-3.5"><div className={`font-display font-semibold text-lg ${data.complaints.escalationRate > 10 ? "text-rose-600" : "text-green-600"}`}>{data.complaints.escalationRate}%</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Escalation rate</div></div>
            </div>

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By category</div>
                {Object.entries(data.complaints.byCategory).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By priority</div>
                {Object.entries(data.complaints.byPriority).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name}</span><span>{v}</span></div>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Ref</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {data.complaints.list.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-900 font-mono text-[12px]">{c.referenceNumber}</td>
                      <td className="text-text-700">{c.category.replaceAll("_", " ")}</td>
                      <td className="text-text-700">{c.priority}</td>
                      <td className="text-text-700">{c.status}{c.escalated && " (escalated)"}</td>
                      <td className="text-text-muted text-[12px]">{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.complaints.list.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No complaints.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
