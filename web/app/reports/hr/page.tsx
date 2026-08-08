"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function HrReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  function load() {
    api.getHrReport(from || undefined, to || undefined).then(setData).catch((err: any) => setError(err.message));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">HR Report</h1>

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
        </div>

        {data && (
          <>
            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Attendance</h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.attendance.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Records</div></div>
              <div className="card p-3.5"><div className={`font-display font-semibold text-lg ${data.attendance.correctionsPending > 0 ? "text-gold-600" : "text-green-600"}`}>{data.attendance.correctionsPending}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Corrections pending</div></div>
            </div>

            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Performance</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.performance.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Reviews</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-green-600">{data.performance.completionRate}%</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Completion rate</div></div>
            </div>
            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By status</div>
                {Object.entries(data.performance.byStatus).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By rating</div>
                {Object.entries(data.performance.byRating).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
                {Object.keys(data.performance.byRating).length === 0 && <div className="text-text-muted text-[13px] py-2">No completed reviews yet.</div>}
              </div>
            </div>

            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Disciplinary</h2>
            <div className="card p-3.5 mb-4 max-w-[200px]"><div className="font-display font-semibold text-lg text-gold-600">{data.disciplinary.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Cases</div></div>
            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By status</div>
                {Object.entries(data.disciplinary.byStatus).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By action taken</div>
                {Object.entries(data.disciplinary.byAction).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
                {Object.keys(data.disciplinary.byAction).length === 0 && <div className="text-text-muted text-[13px] py-2">No resolved cases yet.</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
