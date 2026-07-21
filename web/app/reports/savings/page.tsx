"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { downloadCsv } from "@/lib/csv";
import { AppShell } from "@/components/AppShell";

function money(n: number) {
  return `GHS ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function SavingsReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  function load() {
    api.getSavingsReport(from || undefined, to || undefined).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-6">Savings Report</h1>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">Net flow from</span>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">to</span>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Apply</button>
          {data && (
            <button onClick={() => downloadCsv("savings-report.csv", data.accounts)} className="btn-primary !py-2 ml-auto">
              Export CSV
            </button>
          )}
        </div>

        
        {data && (
          <>
            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-6">
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{data.accounts.length}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Accounts</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">{money(data.accounts.reduce((s: number, a: any) => s + Number(a.balance), 0))}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Total balance</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-green-600">{money(data.netFlowDeposits)}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Deposits in range</div></div>
              <div className="card p-3.5"><div className="font-display font-semibold text-lg text-rose-600">{money(data.netFlowWithdrawals)}</div><div className="text-[10.5px] text-text-muted uppercase tracking-wide">Withdrawals in range</div></div>
            </div>

            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">By branch</div>
                {Object.entries(data.byBranch).map(([name, v]: any) => (
                  <div key={name} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0">
                    <span>{name}</span><span>{v.count} accounts · {money(v.balance)}</span>
                  </div>
                ))}
              </div>
              <div className="card p-4">
                <div className="font-display font-semibold text-sm text-ink-900 mb-2">Top accounts</div>
                {data.topAccounts.map((a: any) => (
                  <div key={a.accountNumber} className="flex justify-between text-[13px] text-text-700 py-1 border-t border-paper-100 first:border-0">
                    <span>{a.customer}</span><span>{money(a.balance)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Account</th><th>Customer</th><th>Branch</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {data.accounts.map((a: any) => (
                    <tr key={a.id}>
                      <td className="font-mono text-[12px] text-text-700">{a.accountNumber}</td>
                      <td className="text-text-900">{a.customer}</td>
                      <td className="text-text-700">{a.branch}</td>
                      <td className="text-text-700">{money(a.balance)}</td>
                      <td className="text-text-700">{a.status}</td>
                    </tr>
                  ))}
                  {data.accounts.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No accounts.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
