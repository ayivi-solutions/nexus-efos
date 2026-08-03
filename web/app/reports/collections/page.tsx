"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function CollectionsReportPage() {
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.getCollectionsReport().then(setData).catch((e) => setError(e.message));
  }, []);

  if (!data) return <AppShell active="Reports"><div className="p-10 text-text-muted text-sm">Loading…</div></AppShell>;

  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Collections Report</h1>
        <p className="text-text-muted text-sm mb-6">doc §85 — Daily Collection, Collector Performance, Route Performance, Cash Settlement, Exceptions, Commission. AI-based insights and forecasting (§85.2-3) await the dedicated AI spec.</p>

        <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-8">
          <div className="card p-4"><div className="font-display font-semibold text-xl text-gold-600">GHS {data.dailyCollection.totalAmount.toLocaleString()}</div><div className="text-[11px] text-text-muted uppercase">Collected today</div></div>
          <div className="card p-4"><div className="font-display font-semibold text-xl text-gold-600">{data.dailyCollection.count}</div><div className="text-[11px] text-text-muted uppercase">Transactions</div></div>
          <div className="card p-4"><div className="font-display font-semibold text-xl text-rose-600">{data.exceptions.unresolvedVariances}</div><div className="text-[11px] text-text-muted uppercase">Unresolved variances</div></div>
          <div className="card p-4"><div className="font-display font-semibold text-xl text-rose-600">{data.exceptions.suspendedCollectors.length}</div><div className="text-[11px] text-text-muted uppercase">Suspended collectors</div></div>
        </div>

        <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Collector Performance</h2>
        <div className="card overflow-x-auto mb-8">
          <table className="w-full min-w-[500px] text-sm table-modern">
            <thead><tr><th>Name</th><th>Availability</th><th>Collected</th><th>Count</th></tr></thead>
            <tbody>
              {data.collectorPerformance.map((c: any) => (
                <tr key={c.collectorId}><td className="text-text-900 font-medium">{c.name}</td><td className="text-text-700">{c.availability}</td><td className="text-text-700">GHS {c.totalCollected.toLocaleString()}</td><td className="text-text-700">{c.collectionCount}</td></tr>
              ))}
              {data.collectorPerformance.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-6">No collectors yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Route Performance</h2>
        <div className="card overflow-x-auto mb-8">
          <table className="w-full min-w-[500px] text-sm table-modern">
            <thead><tr><th>Route</th><th>Customers</th><th>Collected</th></tr></thead>
            <tbody>
              {data.routePerformance.map((r: any) => (
                <tr key={r.routeId}><td className="text-text-900 font-medium">{r.name}</td><td className="text-text-700">{r.customerCount}</td><td className="text-text-700">GHS {r.collected.toLocaleString()}</td></tr>
              ))}
              {data.routePerformance.length === 0 && <tr><td colSpan={3} className="text-center text-text-muted text-sm py-6">No routes yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 dt:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="font-medium text-[13px] text-text-900 mb-2">Cash Settlement</div>
            <div className="text-[12.5px] text-text-700 space-y-1">
              <div>Expected: GHS {data.cashSettlement.totalExpected.toLocaleString()}</div>
              <div>Actual: GHS {data.cashSettlement.totalActual.toLocaleString()}</div>
              <div>Reconciled: {data.cashSettlement.reconciled} · Pending variance: {data.cashSettlement.pendingVariance}</div>
            </div>
          </div>
          <div className="card p-5">
            <div className="font-medium text-[13px] text-text-900 mb-2">Commission</div>
            <div className="text-[12.5px] text-text-700 space-y-1">
              <div>Pending: GHS {data.commissionSummary.pending.toLocaleString()}</div>
              <div>Awaiting approval: GHS {data.commissionSummary.pendingApproval.toLocaleString()}</div>
              <div>Paid: GHS {data.commissionSummary.paid.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
