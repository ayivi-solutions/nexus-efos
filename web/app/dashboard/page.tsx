"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const GOLD = "#C8A951";
const NAVY = "#08172E";
const GREEN = "#16613A";
const ROSE = "#c97a1a";
const VIOLET = "#8BA3BC";
const PIE_COLORS = [GOLD, NAVY, GREEN, ROSE, VIOLET, "#4E6580"];

function money(n: number) {
  return `GHS ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Counts up from 0 to value on mount. Skips the animation entirely under
// prefers-reduced-motion (checked once, not re-evaluated mid-count) —
// the fade-up CSS handles reduced motion at the rule level, this handles
// it for a JS-driven animation the CSS media query can't reach.
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { setDisplay(value); return; }
    const duration = 700;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(display)}</>;
}

function Section({ delayMs, children }: { delayMs: number; children: React.ReactNode }) {
  return <div className="animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>{children}</div>;
}

function AttentionTile({ label, count, href, onClick }: { label: string; count: number; href: string; onClick: (href: string) => void }) {
  const needsAttention = count > 0;
  return (
    <button
      onClick={() => onClick(href)}
      className="card card-interactive p-4 text-left w-full"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
        {needsAttention && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-hidden="true" />}
      </div>
      <div className={`font-display font-semibold text-2xl ${needsAttention ? "text-rose-600" : "text-green-600"}`}>
        {count}
      </div>
    </button>
  );
}

function RatioTile({ label, value, min, suffix = "%", passIsHigh = true }: { label: string; value: number; min: number; suffix?: string; passIsHigh?: boolean }) {
  const ok = passIsHigh ? value >= min : value <= min;
  return (
    <div className="card p-4">
      <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-display font-semibold text-xl ${ok ? "text-green-600" : "text-rose-600"}`}>
        <AnimatedNumber value={value} format={(n) => `${n.toFixed(1)}${suffix}`} />
      </div>
      <div className="text-[11px] text-text-muted mt-0.5">{passIsHigh ? "Minimum" : "Ceiling"} {min}{suffix}</div>
    </div>
  );
}

const QUICK_LINKS = [
  { label: "Cash & Vault", icon: "🏦", href: "/cash-vault" },
  { label: "Cheques", icon: "🖊", href: "/cheques" },
  { label: "Customer Care", icon: "☎", href: "/customer-care" },
  { label: "Collections", icon: "⚑", href: "/collections" },
  { label: "HR", icon: "🧑‍💼", href: "/hr" },
  { label: "Internal Audit", icon: "🛡", href: "/internal-audit" },
  { label: "Capital Adequacy", icon: "⚖", href: "/capital-adequacy" },
  { label: "General Ledger", icon: "📒", href: "/general-ledger" },
  { label: "Analytics", icon: "📈", href: "/analytics" },
  { label: "Payroll", icon: "💰", href: "/payroll" },
  { label: "Assets", icon: "💻", href: "/assets" },
  { label: "Business Rules", icon: "⚡", href: "/business-rules" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [institution, setInstitution] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [attention, setAttention] = useState<{ approvals: number | null; complaints: number | null; findings: number | null; cheques: number | null }>({
    approvals: null, complaints: null, findings: null, cheques: null,
  });
  const [portfolio, setPortfolio] = useState<any>(null);
  const [capital, setCapital] = useState<any>(null);
  const [cashPosition, setCashPosition] = useState<{ vaults: number; tellers: number } | null>(null);

  useEffect(() => {
    api.me().then((res) => setInstitution(res.institution)).catch((err) => setError(err.message));
    api.getReportsOverview().then(setOverview).catch((err) => setError(err.message));

    // Each of these is optional depending on role permissions — a
    // silent catch (leaving the tile's count at null, hidden) is
    // correct here, not an error: someone without institution.configure
    // simply doesn't get an Approvals tile, same as the sidebar already
    // hides items they can't act on.
    api.listApprovals("PENDING").then((r) => setAttention((a) => ({ ...a, approvals: r.requests.length }))).catch(() => {});
    api.listComplaints({ escalatedOnly: true }).then((r) => setAttention((a) => ({ ...a, complaints: r.complaints.length }))).catch(() => {});
    api.listAuditFindings({ overdueOnly: true }).then((r) => setAttention((a) => ({ ...a, findings: r.findings.length }))).catch(() => {});
    api.listPendingConfirmationCheques().then((r) => setAttention((a) => ({ ...a, cheques: r.cheques.length }))).catch(() => {});

    api.getPortfolioOverview().then(setPortfolio).catch(() => {});
    api.getCapitalAdequacyLive().then(setCapital).catch(() => {});
    Promise.all([api.listVaults(), api.listTellers()])
      .then(([v, t]) => setCashPosition({
        vaults: v.vaults.reduce((s: number, x: any) => s + Number(x.balance), 0),
        tellers: t.tellers.reduce((s: number, x: any) => s + Number(x.currentHolding), 0),
      }))
      .catch(() => {});
  }, []);

  const loanStatusData = overview
    ? Object.entries(overview.loans.byStatus).map(([name, value]) => ({ name, value }))
    : [];
  const stageData = overview
    ? Object.entries(overview.customers.byStage).map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))
    : [];
  const trendData = overview?.trend || [];

  const attentionTiles = [
    { label: "Approvals", count: attention.approvals, href: "/approvals" },
    { label: "Escalated Complaints", count: attention.complaints, href: "/customer-care" },
    { label: "Overdue Findings", count: attention.findings, href: "/internal-audit" },
    { label: "Cheques to Confirm", count: attention.cheques, href: "/cheques" },
  ].filter((t) => t.count !== null) as { label: string; count: number; href: string }[];

  return (
    <AppShell active="Dashboard">
      <div className="p-5 dt:p-10">
        {!institution && !error && <p className="text-text-muted text-sm">Loading institution…</p>}

        {institution && (
          <Section delayMs={0}>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {institution.type.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-3xl dt:text-4xl text-ink-900 mb-8">{institution.legalName}</h1>
          </Section>
        )}

        {!overview && !error && <p className="text-text-muted text-sm">Loading reports…</p>}

        {overview && (
          <>
            {/* Needs your attention — the genuinely new piece: a cross-module
                action inbox, not a lookup screen. Hidden entirely if the
                person's role has none of the underlying permissions. */}
            {attentionTiles.length > 0 && (
              <Section delayMs={60}>
                <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Needs your attention</h2>
                <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-8">
                  {attentionTiles.map((t) => (
                    <AttentionTile key={t.label} label={t.label} count={t.count} href={t.href} onClick={router.push} />
                  ))}
                </div>
              </Section>
            )}

            <Section delayMs={110}>
              <div className="grid grid-cols-2 dt:grid-cols-5 gap-3 mb-8">
                <Stat label="Customers" value={overview.customers.total} format={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <Stat label="Loans" value={overview.loans.total} format={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <Stat label="Disbursed" value={overview.loans.totalDisbursed} format={money} />
                <Stat label="Outstanding" value={overview.loans.totalOutstanding} format={money} />
                <Stat label="Savings balance" value={overview.savings.totalBalance} format={money} />
              </div>
            </Section>

            {/* EAIS §148.2 dashboard narrative — templated from real
                month-over-month numbers computed server-side, not a
                generative-AI call (see lib/executiveNarrative.ts).
                Ranked by magnitude of relative change, so what actually
                moved most surfaces first. */}
            {overview.narrative && overview.narrative.length > 0 && (
              <Section delayMs={135}>
                <h2 className="font-display font-semibold text-base text-ink-900 mb-3">What changed</h2>
                <div className="card p-5 mb-8">
                  <ul className="space-y-2">
                    {overview.narrative.map((n: any) => (
                      <li key={n.metric} className="flex items-start gap-2 text-[13px] text-text-700">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.direction === "up" ? "bg-green-500" : n.direction === "down" ? "bg-rose-500" : "bg-text-muted"}`} aria-hidden="true" />
                        <span>{n.sentence}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-text-muted mt-3">Comparing the last two complete calendar months. Numbers only — nothing here is generated free text.</p>
                </div>
              </Section>
            )}

            {/* Portfolio health + regulatory snapshot — reusing the same
                Portfolio Analytics and Capital Adequacy endpoints those
                pages already call, not a new aggregation layer. */}
            {(portfolio || capital) && (
              <Section delayMs={160}>
                <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Portfolio &amp; Regulatory</h2>
                <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-8">
                  {portfolio && (
                    <>
                      <RatioTile label="PAR30" value={portfolio.par30} min={5} passIsHigh={false} />
                      <RatioTile label="PAR90" value={portfolio.par90} min={2} passIsHigh={false} />
                    </>
                  )}
                  {capital && (
                    <>
                      <RatioTile label="Total CAR" value={capital.totalCAR} min={capital.minCAR} />
                      <RatioTile label="NPL Ratio" value={capital.nplRatio} min={capital.nplCeiling} passIsHigh={false} />
                    </>
                  )}
                </div>
              </Section>
            )}

            {/* Cash position — vault + teller holdings right now, not a
                historical report. Only rendered once both loads resolve. */}
            {cashPosition && (
              <Section delayMs={200}>
                <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Cash Position (right now)</h2>
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="card p-4">
                    <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">In Vaults</div>
                    <div className="font-display font-semibold text-xl text-ink-900"><AnimatedNumber value={cashPosition.vaults} format={money} /></div>
                  </div>
                  <div className="card p-4">
                    <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">With Tellers</div>
                    <div className="font-display font-semibold text-xl text-ink-900"><AnimatedNumber value={cashPosition.tellers} format={money} /></div>
                  </div>
                </div>
              </Section>
            )}

            <Section delayMs={250}>
              <div className="grid grid-cols-1 dt:grid-cols-2 gap-6 mb-6">
                <div className="card p-5">
                  <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Loans by status</h2>
                  {loanStatusData.length === 0 ? (
                    <p className="text-text-muted text-sm py-8 text-center">No loans yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={loanStatusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                          {loanStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="card p-5">
                  <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Customers by lifecycle stage</h2>
                  {stageData.length === 0 ? (
                    <p className="text-text-muted text-sm py-8 text-center">No customers yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={stageData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECE4D4" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill={GOLD} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </Section>

            <Section delayMs={300}>
              <div className="card p-5 mb-8">
                <h2 className="font-display font-semibold text-base text-ink-900 mb-4">6-month activity trend</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECE4D4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="disbursed" name="Loans disbursed" stroke={NAVY} fill={NAVY} fillOpacity={0.12} />
                    <Area type="monotone" dataKey="deposits" name="Savings deposits" stroke={GREEN} fill={GREEN} fillOpacity={0.12} />
                    <Area type="monotone" dataKey="withdrawals" name="Savings withdrawals" stroke={ROSE} fill={ROSE} fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            {/* Quick-access grid — mobile-first tap targets for everything
                not already on the bottom nav or the attention strip. */}
            <Section delayMs={350}>
              <h2 className="font-display font-semibold text-base text-ink-900 mb-3">More</h2>
              <div className="grid grid-cols-3 dt:grid-cols-6 gap-3 mb-4">
                {QUICK_LINKS.map((l) => (
                  <button key={l.href} onClick={() => router.push(l.href)} className="card card-interactive p-3 flex flex-col items-center gap-1.5 text-center">
                    <span className="text-xl" aria-hidden="true">{l.icon}</span>
                    <span className="text-[11px] text-text-700 font-medium leading-tight">{l.label}</span>
                  </button>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, format }: { label: string; value: number; format: (n: number) => string }) {
  return (
    <div className="card p-3.5">
      <div className="font-display font-semibold text-lg dt:text-xl text-gold-600 selectable">
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
