"use client";

import { useEffect, useState } from "react";
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

export default function DashboardPage() {
  const [institution, setInstitution] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  useEffect(() => {
    api.me().then((res) => setInstitution(res.institution)).catch((err) => setError(err.message));
    api.getReportsOverview().then(setOverview).catch((err) => setError(err.message));
  }, []);

  const loanStatusData = overview
    ? Object.entries(overview.loans.byStatus).map(([name, value]) => ({ name, value }))
    : [];
  const stageData = overview
    ? Object.entries(overview.customers.byStage).map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))
    : [];
  const trendData = overview?.trend || [];

  return (
    <AppShell active="Dashboard">
      <div className="p-5 dt:p-10">
                {!institution && !error && <p className="text-text-muted text-sm">Loading institution…</p>}

        {institution && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {institution.type.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-3xl dt:text-4xl text-ink-900 mb-8">{institution.legalName}</h1>
          </>
        )}

        {!overview && !error && <p className="text-text-muted text-sm">Loading reports…</p>}

        {overview && (
          <>
            <div className="grid grid-cols-2 dt:grid-cols-5 gap-3 mb-10">
              <Stat label="Customers" value={String(overview.customers.total)} />
              <Stat label="Loans" value={String(overview.loans.total)} />
              <Stat label="Disbursed" value={money(overview.loans.totalDisbursed)} />
              <Stat label="Outstanding" value={money(overview.loans.totalOutstanding)} />
              <Stat label="Savings balance" value={money(overview.savings.totalBalance)} />
            </div>

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

            <div className="card p-5 mb-10">
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
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="font-display font-semibold text-lg dt:text-xl text-gold-600 selectable">{value}</div>
      <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
