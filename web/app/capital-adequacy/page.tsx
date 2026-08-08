"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

function RatioCard({ label, value, min, suffix = "%" }: { label: string; value: number; min: number; suffix?: string }) {
  const ok = value >= min;
  return (
    <div className="card p-4">
      <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-display font-semibold text-xl ${ok ? "text-green-600" : "text-rose-600"}`}>{value}{suffix}</div>
      <div className="text-[11px] text-text-muted mt-0.5">Minimum {min}{suffix}</div>
    </div>
  );
}

export default function CapitalAdequacyPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"car" | "snapshots" | "concentration">("car");

  const [live, setLive] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [concentration, setConcentration] = useState<any>(null);
  const [snapshotDate, setSnapshotDate] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.getCapitalAdequacyLive().then(setLive).catch((e) => setError(e.message));
    api.listCapitalAdequacySnapshots().then((r) => setSnapshots(r.snapshots)).catch(() => {});
    api.getCreditConcentrationRisk().then(setConcentration).catch(() => {});
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault();
    if (!snapshotDate) return;
    setBusy(true); setError(null);
    try {
      await api.createCapitalAdequacySnapshot(snapshotDate);
      toast.success("Snapshot recorded.");
      setSnapshotDate("");
      load();
    } catch (err: any) { setError(err.message || "Could not create snapshot"); } finally { setBusy(false); }
  }

  return (
    <AppShell active="Capital Adequacy">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Capital Adequacy</h1>
        <p className="text-text-muted text-sm mb-4">
          Act 930 §29 + BOG Capital Requirements Directive, 2018 + BOG Guidelines on Credit Concentration Risk, 2025 — built from the actual uploaded source documents, not invented defaults. Tag GL accounts (Capital Tier, Basel Risk Weight%) on the General Ledger page&apos;s Accounts tab before these numbers mean anything — untagged EQUITY accounts contribute nothing to capital, untagged ASSET accounts default to a conservative 100% risk weight.
        </p>
        <p className="text-text-muted text-[12px] mb-6 italic">
          Disclosed gaps: loan classification day-boundaries (30/90/180/365 days) are a convention, not from the uploaded CRD (which only confirms the &gt;90-day past-due threshold and the 25%/50%/100% provisioning floors); &quot;qualifying retail&quot; is a simplified proxy (individual + loan ≤ GHS 500,000); mortgage-specific past-due treatment isn&apos;t applied; Pillar II PD/LGD/EAD modeling for concentration risk is explicitly bank-only in the source document and not built.
        </p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("car")} className={`btn-text ${tab === "car" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>CAR / RWA (live)</button>
          <button onClick={() => setTab("snapshots")} className={`btn-text ${tab === "snapshots" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Snapshots</button>
          <button onClick={() => setTab("concentration")} className={`btn-text ${tab === "concentration" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Credit Concentration</button>
        </div>

        {tab === "car" && live && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <RatioCard label="CET1 Ratio" value={live.cet1Ratio} min={live.minCet1Ratio} />
              <RatioCard label="Tier 1 Ratio" value={live.tier1Ratio} min={live.minTier1Ratio} />
              <RatioCard label="Total CAR" value={live.totalCAR} min={live.minCAR} />
              <RatioCard label="NPL Ratio" value={live.nplRatio} min={0} suffix="%" />
              <div className="card p-4">
                <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">NPL Ceiling (Microfinance)</div>
                <div className={`font-display font-semibold text-xl ${live.nplRatio <= live.nplCeiling ? "text-green-600" : "text-rose-600"}`}>{live.nplCeiling}%</div>
                <div className="text-[11px] text-text-muted mt-0.5">BOG directive, Aug 2026</div>
              </div>
              <div className="card p-4">
                <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">Total RWA</div>
                <div className="font-display font-semibold text-xl text-ink-900">GHS {live.totalRWA.toLocaleString()}</div>
                <div className="text-[11px] text-text-muted mt-0.5">Loans GHS {live.loanRWA.toLocaleString()} · Other GHS {live.otherAssetRWA.toLocaleString()}</div>
              </div>
            </div>

            {live.unclassifiedAssetBalance > 0 && (
              <div className="card p-4 mb-6 border-gold-500/40 bg-gold-500/5">
                <div className="text-[13px] text-gold-700 font-medium">GHS {live.unclassifiedAssetBalance.toLocaleString()} in unclassified asset accounts</div>
                <div className="text-[12px] text-text-muted">These are defaulted to a conservative 100% risk weight. Tag them on the General Ledger Accounts tab for an accurate figure.</div>
              </div>
            )}

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Loan Classification</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Classification</th><th>Loans</th><th>Outstanding</th></tr></thead>
                <tbody>
                  {Object.entries(live.classificationCounts || {}).map(([k, v]: any) => (
                    <tr key={k}>
                      <td className="text-text-900 font-medium">{k}</td>
                      <td className="text-text-700">{v.count}</td>
                      <td className="text-text-700">GHS {v.outstanding.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "snapshots" && (
          <>
            <form onSubmit={handleCreateSnapshot} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <input required type="date" className="input" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
              <button type="submit" disabled={busy} className="btn-primary">Record snapshot</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Date</th><th>CET1</th><th>Tier 1</th><th>Total CAR</th><th>NPL</th><th>RWA</th></tr></thead>
                <tbody>
                  {snapshots.map((s: any) => (
                    <tr key={s.id}>
                      <td className="text-text-900 font-medium">{new Date(s.asOfDate).toLocaleDateString()}</td>
                      <td className={Number(s.cet1Ratio) >= Number(s.minCet1Ratio) ? "text-green-600" : "text-rose-600"}>{s.cet1Ratio}%</td>
                      <td className={Number(s.tier1Ratio) >= Number(s.minTier1Ratio) ? "text-green-600" : "text-rose-600"}>{s.tier1Ratio}%</td>
                      <td className={Number(s.totalCAR) >= Number(s.minCAR) ? "text-green-600 font-medium" : "text-rose-600 font-medium"}>{s.totalCAR}%</td>
                      <td className={Number(s.nplRatio) <= Number(s.nplCeiling) ? "text-green-600" : "text-rose-600"}>{s.nplRatio}%</td>
                      <td className="text-text-700">GHS {Number(s.totalRWA).toLocaleString()}</td>
                    </tr>
                  ))}
                  {snapshots.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No snapshots recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "concentration" && concentration && (
          <>
            <p className="text-text-muted text-[12.5px] mb-4">Model-free (heuristic) metrics per BOG Credit Concentration Risk Guidelines §26 — the Pillar II capital-add-on modeling in the same document (§39-48) is explicitly bank-only and not built here.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="card p-4">
                <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">HHI</div>
                <div className="font-display font-semibold text-xl text-ink-900">{concentration.hhi}</div>
                <div className="text-[11px] text-text-muted mt-0.5">0 = diversified, 1 = single exposure</div>
              </div>
              <div className="card p-4">
                <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">Gini Coefficient</div>
                <div className="font-display font-semibold text-xl text-ink-900">{concentration.gini}</div>
                <div className="text-[11px] text-text-muted mt-0.5">0 = equal exposure, 1 = maximum concentration</div>
              </div>
              <div className="card p-4">
                <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">Exposures</div>
                <div className="font-display font-semibold text-xl text-ink-900">{concentration.exposureCount}</div>
                <div className="text-[11px] text-text-muted mt-0.5">GHS {concentration.totalOutstanding.toLocaleString()} total</div>
              </div>
            </div>
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Concentration Ratios</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm table-modern">
                <thead><tr><th>Top N</th><th>% of Portfolio</th></tr></thead>
                <tbody>
                  {Object.entries(concentration.concentrationRatios || {}).map(([k, v]: any) => (
                    <tr key={k}><td className="text-text-900 font-medium">{k.replace("top", "Top ")}</td><td className="text-text-700">{v}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
