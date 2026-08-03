"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { downloadCsv } from "@/lib/csv";
import { AppShell } from "@/components/AppShell";

function money(n: number) {
  return `GHS ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function LoanReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  function load() {
    api.getLoanReport(from || undefined, to || undefined).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">Loan Portfolio Report</h1>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">From</span>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">To</span>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Apply</button>
          {data && (
            <button onClick={() => downloadCsv("loan-portfolio-report.csv", data.loans)} className="btn-primary !py-2 ml-auto">
              Export CSV
            </button>
          )}
        </div>

        
        {data && (
          <>
            {/* doc §77/§76 — PAR30 (Portfolio at Risk, 30+ days overdue), computed
                from real arrears data recalculated daily (lib/scheduler.ts), not
                an approximation based on time since disbursement. */}
            <div className="card p-5 mb-6 bg-gold-500/10 border-gold-500/30">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-display font-semibold text-3xl text-ink-900">{data.portfolioAtRisk.parPercent}%</span>
                <span className="text-text-700 text-sm">Portfolio at Risk (PAR30)</span>
              </div>
              <div className="text-text-muted text-xs mt-1">GHS {Number(data.portfolioAtRisk.atRiskPortfolio).toLocaleString()} at risk of GHS {Number(data.portfolioAtRisk.outstandingPortfolio).toLocaleString()} outstanding</div>
            </div>

            <div className="grid grid-cols-2 dt:grid-cols-5 gap-3 mb-6">
              {Object.entries(data.arrearsAging).map(([bucket, count]) => (
                <div key={bucket} className="card p-3.5">
                  <div className="font-display font-semibold text-lg text-gold-600">{String(count)}</div>
                  <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{bucket.replaceAll("_", " ")}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By branch</div>
                {Object.entries(data.byBranch).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0">
                    <span>{name}</span><span>{v.count} loans · {money(v.principal)}</span>
                  </div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By status</div>
                {Object.entries(data.byStatus).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0">
                    <span>{name}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm table-modern">
                <thead><tr><th>Customer</th><th>Branch</th><th>Principal</th><th>Rate</th><th>Term</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {data.loans.map((l: any) => (
                    <tr key={l.id}>
                      <td className="text-text-900">{l.customer}</td>
                      <td className="text-text-700">{l.branch}</td>
                      <td className="text-text-700">{money(l.principal)}</td>
                      <td className="text-text-700">{l.interestRate}%</td>
                      <td className="text-text-700">{l.termMonths}mo</td>
                      <td className="text-text-700">{l.status}</td>
                      <td className="text-text-700 whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.loans.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No loans in range.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
