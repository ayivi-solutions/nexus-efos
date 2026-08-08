"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function AnalyticsPage() {
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"financial" | "portfolio">("financial");
  const [trend, setTrend] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [branchPerf, setBranchPerf] = useState<any>(null);

  const [portfolioOverview, setPortfolioOverview] = useState<any>(null);
  const [portfolioAging, setPortfolioAging] = useState<any>(null);
  const [portfolioByBranch, setPortfolioByBranch] = useState<any>(null);
  const [portfolioByProduct, setPortfolioByProduct] = useState<any>(null);
  const [portfolioConcentration, setPortfolioConcentration] = useState<any>(null);

  useEffect(() => {
    api.getProfitabilityTrend(6).then((r) => setTrend(r.months)).catch((e) => setError(e.message));
    api.getNetIncomeForecast(6).then(setForecast).catch(() => {});
    api.getBranchPerformance().then((r) => setBranchPerf(r.branches)).catch(() => {});
    api.getPortfolioOverview().then(setPortfolioOverview).catch((e) => setError(e.message));
    api.getPortfolioAging().then((r) => setPortfolioAging(r.buckets)).catch(() => {});
    api.getPortfolioByBranch().then((r) => setPortfolioByBranch(r.branches)).catch(() => {});
    api.getPortfolioByProduct().then((r) => setPortfolioByProduct(r.products)).catch(() => {});
    api.getPortfolioConcentration(10).then(setPortfolioConcentration).catch(() => {});
  }, []);

  const maxAbs = trend ? Math.max(...trend.map((m: any) => Math.max(Math.abs(m.income), Math.abs(m.expense))), 1) : 1;
  const maxAging = portfolioAging ? Math.max(...portfolioAging.map((b: any) => b.outstanding), 1) : 1;

  return (
    <AppShell active="Financial Analytics">
      <div className="p-5 dt:p-10">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Financial Analytics</h1>
        <p className="text-text-muted text-sm mb-4">doc §125 — Revenue, Expense, and Profitability trends, Branch Performance, and a disclosed simple trend forecast, all from real posted GL data. Product Profitability, Cost Centre Analysis, Budget Variance, and AI-Based Insights are named gaps, not built yet — see the README for why.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("financial")} className={`btn-text ${tab === "financial" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Financial (GL)</button>
          <button onClick={() => setTab("portfolio")} className={`btn-text ${tab === "portfolio" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Loan Portfolio</button>
        </div>

        {tab === "financial" && (
          <>
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
          </>
        )}

        {tab === "portfolio" && (
          <>
            <p className="text-text-muted text-[12.5px] mb-4">EFS §76 Loan Portfolio Management. Sector Analysis and Officer Performance aren&apos;t built — no sector field exists on Customer, no loan-officer assignment field exists on Loan.</p>

            {portfolioOverview && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="card p-4">
                  <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">Outstanding Portfolio</div>
                  <div className="font-display font-semibold text-xl text-ink-900">GHS {portfolioOverview.totalOutstanding.toLocaleString()}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">Active Loans</div>
                  <div className="font-display font-semibold text-xl text-ink-900">{portfolioOverview.loanCount.toLocaleString()}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">PAR30</div>
                  <div className={`font-display font-semibold text-xl ${portfolioOverview.par30 > 5 ? "text-rose-600" : "text-ink-900"}`}>{portfolioOverview.par30}%</div>
                </div>
                <div className="card p-4">
                  <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">PAR90</div>
                  <div className={`font-display font-semibold text-xl ${portfolioOverview.par90 > 2 ? "text-rose-600" : "text-ink-900"}`}>{portfolioOverview.par90}%</div>
                </div>
              </div>
            )}

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Portfolio Aging</h2>
            {portfolioAging && (
              <div className="card p-5 mb-8">
                <div className="space-y-3">
                  {portfolioAging.map((b: any) => (
                    <div key={b.bucket}>
                      <div className="flex justify-between text-[12px] text-text-700 mb-1">
                        <span className="font-medium">{b.bucket.replaceAll("_", " ")}</span>
                        <span>{b.loanCount} loan(s) · GHS {b.outstanding.toLocaleString()}</span>
                      </div>
                      <div className="h-3">
                        <div className={`rounded-sm h-3 ${b.bucket === "CURRENT" ? "bg-green-400" : b.bucket === "ARREARS_90_PLUS" ? "bg-rose-500" : "bg-gold-400"}`} style={{ width: `${(b.outstanding / maxAging) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Portfolio by Branch</h2>
            <div className="card overflow-x-auto mb-8">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Branch</th><th>Loans</th><th>Outstanding</th><th>PAR30</th></tr></thead>
                <tbody>
                  {(portfolioByBranch || []).map((b: any) => (
                    <tr key={b.branchId || "u"}>
                      <td className="text-text-900">{b.branchName}</td>
                      <td className="text-text-700">{b.loanCount}</td>
                      <td className="text-text-700">GHS {b.outstanding.toLocaleString()}</td>
                      <td className={`font-medium ${b.par30 > 5 ? "text-rose-600" : "text-text-700"}`}>{b.par30}%</td>
                    </tr>
                  ))}
                  {(!portfolioByBranch || portfolioByBranch.length === 0) && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-6">No outstanding loans.</td></tr>}
                </tbody>
              </table>
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Portfolio by Product</h2>
            <div className="card overflow-x-auto mb-8">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Product</th><th>Loans</th><th>Outstanding</th><th>PAR30</th></tr></thead>
                <tbody>
                  {(portfolioByProduct || []).map((p: any) => (
                    <tr key={p.productVersionId || "u"}>
                      <td className="text-text-900">{p.productName}</td>
                      <td className="text-text-700">{p.loanCount}</td>
                      <td className="text-text-700">GHS {p.outstanding.toLocaleString()}</td>
                      <td className={`font-medium ${p.par30 > 5 ? "text-rose-600" : "text-text-700"}`}>{p.par30}%</td>
                    </tr>
                  ))}
                  {(!portfolioByProduct || portfolioByProduct.length === 0) && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-6">No outstanding loans.</td></tr>}
                </tbody>
              </table>
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Top 10 Borrowers (Exposure)</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Customer</th><th>Outstanding</th><th>% of Portfolio</th></tr></thead>
                <tbody>
                  {(portfolioConcentration?.topBorrowers || []).map((c: any) => (
                    <tr key={c.customerId}>
                      <td className="text-text-900">{c.customerName}</td>
                      <td className="text-text-700">GHS {c.outstanding.toLocaleString()}</td>
                      <td className="text-text-700">{c.percentOfPortfolio}%</td>
                    </tr>
                  ))}
                  {(!portfolioConcentration || portfolioConcentration.topBorrowers.length === 0) && <tr><td colSpan={3} className="text-center text-text-muted text-sm py-6">No outstanding loans.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
