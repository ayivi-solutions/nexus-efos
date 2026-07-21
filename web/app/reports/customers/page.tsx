"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { AppShell } from "@/components/AppShell";

export default function CustomerReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.getCustomerReport(from || undefined, to || undefined).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">Customer Report</h1>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">Acquired from</span>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">to</span>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Apply</button>
          {data && (
            <button onClick={() => downloadCsv("customer-report.csv", data.customers)} className="btn-primary !py-2 ml-auto">
              Export CSV
            </button>
          )}
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total customers</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.newInRange}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Acquired in range</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-green-600">{data.kycComplianceRate}%</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">KYC verified</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{Object.keys(data.byBranch).length}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Branches represented</div></div>
            </div>

            <div className="grid grid-cols-1 dt:grid-cols-3 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By segment</div>
                {Object.entries(data.bySegment).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By lifecycle stage</div>
                {Object.entries(data.byStage).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By branch</div>
                {Object.entries(data.byBranch).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name}</span><span>{v}</span></div>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Name</th><th>Phone</th><th>Branch</th><th>Segment</th><th>Stage</th><th>KYC</th></tr></thead>
                <tbody>
                  {data.customers.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-900">{c.fullName}</td>
                      <td className="text-text-700">{c.phone}</td>
                      <td className="text-text-700">{c.branch}</td>
                      <td className="text-text-700">{c.segment.replaceAll("_", " ")}</td>
                      <td className="text-text-700">{c.lifecycleStage.replaceAll("_", " ")}</td>
                      <td className="text-text-700">{c.kycStatus}</td>
                    </tr>
                  ))}
                  {data.customers.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No customers.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
