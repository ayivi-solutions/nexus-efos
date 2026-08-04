"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function AnalyticsPage() {
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [trend, setTrend] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [branchPerf, setBranchPerf] = useState<any>(null);

  useEffect(() => {
    api.getProfitabilityTrend(6).then((r) => setTrend(r.months)).catch((e) => setError(e.message));
    api.getNetIncomeForecast(6).then(setForecast).catch(() => {});
    api.getBranchPerformance().then((r) => setBranchPerf(r.branches)).catch(() => {});
  }, []);

  const maxAbs = trend ? Math.max(...trend.map((m: any) => Math.max(Math.abs(m.income), Math.abs(m.expense))), 1) : 1;

  return (
    <AppShell active="General Ledger">
      <div className="p-5 dt:p-10">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Financial Analytics</h1>
        <p className="text-text-muted text-sm mb-6">doc §125 — Revenue, Expense, and Profitability trends, Branch Performance, and a disclosed simple trend forecast, all from real posted GL data. Product Profitability, Cost Centre Analysis, Budget Variance, and AI-Based Insights are named gaps, not built yet — see the README for why.</p>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Profitability Trend (last 6 months)</h2>
        {trend && (
          <div className="card p-5 mb-8">
            <div className="space-y-3">
              {trend.map((m: any) => (
                <div key={m.label}>
                  <div className="flex justify-between text-[12px] text-text-700 mb-1">
                    <span className="font-medium">{m.label}</span>
                    <span>Income GHS {m.income.toLocaleString()} · Expense GHS {m.expense.toLocaleString()} · Net {m.netIncome >= 0 ? "" : "-"}GHS {Math.abs(m.netIncome).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-1 h-3">
                    <div className="bg-green-400 rounded-sm" style={{ width: `${(m.income / maxAbs) * 100}%` }} />
                    <div className="bg-rose-400 rounded-sm" style={{ width: `${(m.expense / maxAbs) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Net Income Forecast</h2>
        {forecast && (
          <div className="card p-5 mb-8">
            <div className="text-[13px] text-text-700 mb-1">Projected next month: <span className="font-semibold text-ink-900">GHS {forecast.forecast.nextValue.toLocaleString()}</span></div>
            <div className="text-[11px] text-text-muted italic">{forecast.forecast.method}</div>
          </div>
        )}

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Branch Performance (this month)</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm table-modern">
            <thead><tr><th>Branch</th><th>Income</th><th>Expense</th><th>Net Income</th></tr></thead>
            <tbody>
              {(branchPerf || []).map((b: any) => (
                <tr key={b.branchId || "u"}>
                  <td className="text-text-900">{b.branchName}</td>
                  <td className="text-text-700">GHS {b.income.toLocaleString()}</td>
                  <td className="text-text-700">GHS {b.expense.toLocaleString()}</td>
                  <td className={`font-medium ${b.netIncome >= 0 ? "text-green-600" : "text-rose-600"}`}>GHS {b.netIncome.toLocaleString()}</td>
                </tr>
              ))}
              {(!branchPerf || branchPerf.length === 0) && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-6">No activity this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
