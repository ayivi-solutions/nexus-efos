"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { downloadCsv } from "@/lib/csv";
import { AppShell } from "@/components/AppShell";

export default function ChequeReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  function load() {
    api.getChequeReport(from || undefined, to || undefined).then(setData).catch((err: any) => setError(err.message));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">Cheque Register Report</h1>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">Recorded from</span>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">to</span>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Apply</button>
          {data && (
            <button onClick={() => downloadCsv("cheque-register-report.csv", data.cheques)} className="btn-primary !py-2 ml-auto">
              Export CSV
            </button>
          )}
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.total}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total cheques</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {data.totalAmount.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total value</div></div>
              <div className={`card p-3.5`}><div className={`font-display font-semibold text-lg ${data.bounceRate > 5 ? "text-rose-600" : "text-green-600"}`}>{data.bounceRate}%</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Bounce rate</div></div>
              <div className="card p-3.5"><div className={`font-display font-semibold text-lg ${data.pendingConfirmationCount > 0 ? "text-gold-600" : "text-green-600"}`}>{data.pendingConfirmationCount}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Pending confirmation</div></div>
            </div>

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By status</div>
                {Object.entries(data.byStatus).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name.replaceAll("_", " ")}</span><span>{v}</span></div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By direction</div>
                {Object.entries(data.byDirection).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0"><span>{name}</span><span>{v}</span></div>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Direction</th><th>Cheque #</th><th>Bank</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {data.cheques.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-700">{c.direction}</td>
                      <td className="text-text-900 font-medium">{c.chequeNumber}</td>
                      <td className="text-text-700">{c.bankName}</td>
                      <td className="text-text-700">GHS {Number(c.amount).toLocaleString()}</td>
                      <td className="text-text-700">{c.status.replaceAll("_", " ")}</td>
                      <td className="text-text-muted text-[12px]">{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.cheques.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No cheques.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
