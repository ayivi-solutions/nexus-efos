#!/usr/bin/env bash
set -euo pipefail
# Run from ~/Documents/GitHub/nexus-efos, on develop.
# Mobile-first responsive pass: deepened navy chrome (ink-950, matches
# login), collapsible sidebar -> mobile drawer, card-stacked tables below
# sm, animated transitions/rows/buttons. Extracts shared PageShell,
# DataTable, PageHeader components — every future list page reuses these
# instead of copy-pasted markup. Full-file overwrites, verified working.

mkdir -p web/app
cat > web/app/globals.css << 'FILE_EOF'
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-paper-0 text-text-900 font-body;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideInLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes rowIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up { animation: fadeInUp 0.35s ease-out both; }
.animate-fade-in { animation: fadeIn 0.25s ease-out both; }
.animate-slide-in-left { animation: slideInLeft 0.25s ease-out both; }
.animate-row-in { animation: rowIn 0.3s ease-out both; }

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up, .animate-fade-in, .animate-slide-in-left, .animate-row-in {
    animation: none;
  }
}

.input {
  width: 100%;
  border: 1px solid #ece4d4;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 14px;
  background: #fff;
  transition: outline-color 0.15s ease;
}
.input:focus {
  outline: 2px solid #d59535;
  outline-offset: 1px;
}
@media (min-width: 640px) {
  .input { font-size: 13px; }
}
FILE_EOF
echo 'Wrote: web/app/globals.css'

mkdir -p web/components
cat > web/components/Sidebar.tsx << 'FILE_EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const NAV = [
  { label: "Overview", icon: "◆", href: "/dashboard" },
  { label: "Customers", icon: "○", href: "/customers" },
  { label: "Loans", icon: "▢", href: "/loans" },
  { label: "Savings", icon: "▣", href: "/savings" },
  { label: "Branches", icon: "▤", href: "#" },
  { label: "Roles & Permissions", icon: "◈", href: "#" },
  { label: "Audit Log", icon: "▥", href: "#" },
];

function NavList({ active, onNavigate }: { active: string; onNavigate: (href: string) => void }) {
  return (
    <nav className="flex-1 p-3 space-y-1">
      {NAV.map((item) => (
        <button
          key={item.label}
          onClick={() => onNavigate(item.href)}
          className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition-all duration-150 active:scale-[0.98] ${
            item.label === active
              ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#E8B563]"
              : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
          }`}
        >
          <span className="text-gold-500">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="h-14 flex items-center gap-2 px-5 border-b shrink-0" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
      <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" style={{ boxShadow: "0 0 8px #E8B563" }} />
      <span className="font-mono text-sm tracking-wide">
        NEXUS <b className="text-gold-400">EFOS</b>
      </span>
    </div>
  );
}

export function Sidebar({ active }: { active: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function navigate(href: string) {
    setOpen(false);
    if (href !== "#") router.push(href);
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-ink-950 text-paper-50 px-4 h-14 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #E8B563" }} />
          <span className="font-mono text-sm tracking-wide">
            NEXUS <b className="text-gold-400">EFOS</b>
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 flex items-center justify-center rounded-md text-gold-400 active:scale-90 transition-transform"
        >
          <span className="text-xl leading-none">☰</span>
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <aside className="relative w-[78%] max-w-[280px] bg-ink-950 text-paper-50 flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between px-5 h-14 border-b shrink-0" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
              <span className="font-mono text-sm tracking-wide">
                NEXUS <b className="text-gold-400">EFOS</b>
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="w-8 h-8 flex items-center justify-center text-violet-500 active:scale-90 transition-transform"
              >
                ✕
              </button>
            </div>
            <NavList active={active} onNavigate={navigate} />
            <div className="p-4 border-t text-[11px] text-violet-500 shrink-0" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
              Core Platform · Working Draft v0.1
            </div>
          </aside>
        </div>
      )}

      {/* Desktop fixed rail */}
      <aside className="hidden md:flex w-[260px] bg-ink-950 text-paper-50 flex-col shrink-0">
        <Brand />
        <NavList active={active} onNavigate={navigate} />
        <div className="p-4 border-t text-[11px] text-violet-500" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
          Core Platform · Working Draft v0.1
        </div>
      </aside>
    </>
  );
}
FILE_EOF
echo 'Wrote: web/components/Sidebar.tsx'

mkdir -p web/components
cat > web/components/PageShell.tsx << 'FILE_EOF'
import { Sidebar } from "./Sidebar";

export function PageShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper-0">
      <Sidebar active={active} />
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 md:p-10 animate-fade-in-up">{children}</main>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/components/PageShell.tsx'

mkdir -p web/components
cat > web/components/DataTable.tsx << 'FILE_EOF'
export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  renderMobileCard,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  emptyMessage: string;
  renderMobileCard: (row: T) => React.ReactNode;
}) {
  return (
    <>
      {/* Mobile: stacked cards — every list page in the app gets this for free */}
      <div className="sm:hidden space-y-2.5">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="border border-paper-100 rounded-lg p-4 bg-paper-0 animate-row-in"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            {renderMobileCard(row)}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-center text-text-muted text-sm py-8 border border-paper-100 rounded-lg">
            {emptyMessage}
          </div>
        )}
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden sm:block border border-paper-100 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className="border-t border-paper-100 animate-row-in transition-colors hover:bg-paper-50/60"
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
FILE_EOF
echo 'Wrote: web/components/DataTable.tsx'

mkdir -p web/components
cat > web/components/PageHeader.tsx << 'FILE_EOF'
export function PageHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
      <h1 className="font-display font-semibold text-[26px] sm:text-3xl text-ink-900">{title}</h1>
      <button
        onClick={onAction}
        className="px-3.5 py-2 sm:px-4 rounded-md bg-ink-950 text-gold-400 font-semibold text-[13px] sm:text-sm transition-all duration-150 hover:bg-ink-800 active:scale-95 shrink-0"
      >
        {actionLabel}
      </button>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/components/PageHeader.tsx'

mkdir -p web/components
cat > web/components/OnboardingShell.tsx << 'FILE_EOF'
const STEPS = ["Institution", "Details", "Branches", "Staff", "Go Live"];

export function OnboardingShell({
  step,
  title,
  children,
}: {
  step: number; // 1-5
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper-0 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "active" : "pending";
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                    state === "done"
                      ? "bg-gold-500 text-ink-900"
                      : state === "active"
                      ? "bg-ink-900 text-gold-400"
                      : "bg-paper-100 text-text-muted"
                  }`}
                >
                  {state === "done" ? "✓" : n}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${n < step ? "bg-gold-500" : "bg-paper-100"}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-paper-0 border border-paper-100 rounded-lg p-8 shadow-sm">
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-rose-600 mb-2">
            Institution Onboarding · Step {step} of 5
          </div>
          <h1 className="font-display font-semibold text-3xl text-ink-900 mb-6">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
FILE_EOF
echo 'Wrote: web/components/OnboardingShell.tsx'

mkdir -p web/app/dashboard
cat > web/app/dashboard/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageShell } from "@/components/PageShell";

export default function DashboardPage() {
  const router = useRouter();
  const [institution, setInstitution] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("nexus_access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    api
      .me()
      .then((res) => setInstitution(res.institution))
      .catch((err) => setError(err.message));
  }, [router]);

  return (
    <PageShell active="Overview">
      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
      {!institution && !error && <p className="text-text-muted text-sm animate-fade-in">Loading institution…</p>}

      {institution && (
        <>
          <div className="font-mono text-[11px] sm:text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
            {institution.type.replaceAll("_", " ")}
          </div>
          <h1 className="font-display font-semibold text-[28px] leading-tight sm:text-4xl text-ink-900 mb-6 sm:mb-8">
            {institution.legalName}
          </h1>

          {institution.onboardingStep < 5 && (
            <button
              onClick={() =>
                router.push(
                  ["", "onboarding", "onboarding/details", "onboarding/branches", "onboarding/staff", "onboarding/go-live"][
                    institution.onboardingStep
                  ]
                )
              }
              className="mb-6 sm:mb-8 w-full text-left px-4 py-3 rounded-md bg-gold-300/30 border border-gold-500/40 text-ink-900 text-sm transition-all duration-150 hover:bg-gold-300/50 active:scale-[0.99]"
            >
              Onboarding is at step {institution.onboardingStep} of 5 — continue setup →
            </button>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-8 sm:mb-10">
            <Stat label="Onboarding step" value={`${institution.onboardingStep} / 5`} delay={0} />
            <Stat label="Status" value={institution.status.replaceAll("_", " ")} delay={60} />
            <Stat label="Branches" value={String(institution.branches?.length ?? 0)} delay={120} />
            <Stat label="Region" value={institution.region || "—"} delay={180} />
          </div>

          <div className="border border-paper-100 rounded-lg p-5 sm:p-6">
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-2">Core platform prototype</h2>
            <p className="text-text-700 text-[14px] sm:text-[15px] leading-relaxed">
              Auth, RBAC, institution onboarding, Customer Lifecycle Management, Loans and Savings
              are live. Next: Branches management, Roles &amp; Permissions UI, Audit Log.
            </p>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div
      className="bg-paper-50 border border-paper-100 rounded-md p-3 sm:p-3.5 animate-fade-in-up transition-transform hover:-translate-y-0.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="font-display font-semibold text-lg sm:text-xl text-gold-600">{value}</div>
      <div className="text-[10px] sm:text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/app/dashboard/page.tsx'

mkdir -p web/app/customers
cat > web/app/customers/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

const STAGE_COLOR: Record<string, string> = {
  ONBOARDING: "bg-violet-500/15 text-violet-500",
  ACTIVATION: "bg-gold-500/15 text-gold-600",
  GROWTH: "bg-green-100 text-green-600",
  RETENTION: "bg-green-100 text-green-600",
  ADVOCACY: "bg-green-100 text-green-600",
  RE_ENGAGEMENT: "bg-rose-100 text-rose-600",
};

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full ${STAGE_COLOR[stage] || ""}`}>
      {stage.replaceAll("_", " ")}
    </span>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listCustomers().then((res) => setCustomers(res.customers)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createCustomer(form);
      setForm({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell active="Customers">
      <PageHeader title="Customers" actionLabel={showForm ? "Cancel" : "+ New"} onAction={() => setShowForm((s) => !s)} />

      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 bg-paper-50 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
              <input required className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
              <input required className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Email (optional)</span>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
              <select className="input" value={form.segment} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={saving} className="w-full sm:w-auto px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm transition-all duration-150 hover:bg-gold-400 active:scale-95 disabled:opacity-60">
            {saving ? "Saving…" : "Create customer"}
          </button>
        </form>
      )}

      <DataTable
        rows={customers}
        emptyMessage="No customers yet."
        columns={[
          { key: "name", label: "Name", render: (c) => <span className="text-text-900">{c.fullName}</span> },
          { key: "phone", label: "Phone", render: (c) => <span className="text-text-700">{c.phone}</span> },
          { key: "segment", label: "Segment", render: (c) => <span className="text-text-700">{c.segment.replaceAll("_", " ")}</span> },
          { key: "stage", label: "Stage", render: (c) => <StageBadge stage={c.lifecycleStage} /> },
          { key: "kyc", label: "KYC", render: (c) => <span className="text-text-500">{c.kycStatus}</span> },
        ]}
        renderMobileCard={(c) => (
          <>
            <div className="flex items-start justify-between mb-1.5">
              <div className="font-medium text-text-900 text-[15px]">{c.fullName}</div>
              <StageBadge stage={c.lifecycleStage} />
            </div>
            <div className="text-[13px] text-text-500">{c.phone}</div>
            <div className="flex items-center justify-between mt-2 text-[12px] text-text-muted">
              <span>{c.segment.replaceAll("_", " ")}</span>
              <span>KYC: {c.kycStatus}</span>
            </div>
          </>
        )}
      />
    </PageShell>
  );
}
FILE_EOF
echo 'Wrote: web/app/customers/page.tsx'

mkdir -p web/app/loans
cat > web/app/loans/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  APPROVED: "bg-gold-500/15 text-gold-600",
  REJECTED: "bg-rose-100 text-rose-600",
  DISBURSED: "bg-green-100 text-green-600",
  ACTIVE: "bg-green-100 text-green-600",
  CLOSED: "bg-paper-100 text-text-muted",
  DEFAULTED: "bg-rose-100 text-rose-600",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[status] || ""}`}>{status}</span>;
}

export default function LoansPage() {
  const router = useRouter();
  const [loans, setLoans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: "", principal: "", interestRate: "", termMonths: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listLoans().then((res) => setLoans(res.loans)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createLoan({
        customerId: form.customerId,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        termMonths: Number(form.termMonths),
      });
      setForm({ customerId: "", principal: "", interestRate: "", termMonths: "" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create loan");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject" | "disburse") {
    setError(null);
    try {
      if (action === "approve") await api.approveLoan(id);
      if (action === "reject") await api.rejectLoan(id);
      if (action === "disburse") await api.disburseLoan(id);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    }
  }

  function Actions({ loan }: { loan: any }) {
    if (loan.status === "PENDING") {
      return (
        <div className="flex gap-3">
          <button onClick={() => handleAction(loan.id, "approve")} className="text-[12px] text-green-600 hover:underline active:scale-95 transition-transform">Approve</button>
          <button onClick={() => handleAction(loan.id, "reject")} className="text-[12px] text-rose-600 hover:underline active:scale-95 transition-transform">Reject</button>
        </div>
      );
    }
    if (loan.status === "APPROVED") {
      return <button onClick={() => handleAction(loan.id, "disburse")} className="text-[12px] text-gold-600 hover:underline active:scale-95 transition-transform">Disburse</button>;
    }
    return null;
  }

  return (
    <PageShell active="Loans">
      <PageHeader title="Loans" actionLabel={showForm ? "Cancel" : "+ New"} onAction={() => setShowForm((s) => !s)} />

      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 bg-paper-50 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
              <select required className="input" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
                <option value="">Select…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Principal (GHS)</span>
              <input required type="number" min="1" className="input" value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Interest rate (% p.a.)</span>
              <input required type="number" min="0" step="0.1" className="input" value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Term (months)</span>
              <input required type="number" min="1" className="input" value={form.termMonths} onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))} />
            </label>
          </div>
          <button type="submit" disabled={saving || !customers.length} className="w-full sm:w-auto px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm transition-all duration-150 hover:bg-gold-400 active:scale-95 disabled:opacity-60">
            {saving ? "Saving…" : "Initiate loan"}
          </button>
          {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
        </form>
      )}

      <DataTable
        rows={loans}
        emptyMessage="No loans yet."
        columns={[
          { key: "customer", label: "Customer", render: (l) => <span className="text-text-900">{l.customer?.fullName}</span> },
          { key: "principal", label: "Principal", render: (l) => <span className="text-text-700">GHS {Number(l.principal).toLocaleString()}</span> },
          { key: "rate", label: "Rate", render: (l) => <span className="text-text-700">{l.interestRate}%</span> },
          { key: "term", label: "Term", render: (l) => <span className="text-text-700">{l.termMonths}mo</span> },
          { key: "status", label: "Status", render: (l) => <StatusBadge status={l.status} /> },
          { key: "actions", label: "Actions", render: (l) => <Actions loan={l} /> },
        ]}
        renderMobileCard={(l) => (
          <>
            <div className="flex items-start justify-between mb-1.5">
              <div className="font-medium text-text-900 text-[15px]">{l.customer?.fullName}</div>
              <StatusBadge status={l.status} />
            </div>
            <div className="text-[13px] text-text-500">GHS {Number(l.principal).toLocaleString()} · {l.interestRate}% · {l.termMonths}mo</div>
            <div className="mt-2"><Actions loan={l} /></div>
          </>
        )}
      />
    </PageShell>
  );
}
FILE_EOF
echo 'Wrote: web/app/loans/page.tsx'

mkdir -p web/app/savings
cat > web/app/savings/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";

export default function SavingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [txnAmount, setTxnAmount] = useState<Record<string, string>>({});

  function load() {
    api.listSavingsAccounts().then((res) => setAccounts(res.accounts)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.openSavingsAccount({ customerId: newCustomerId });
      setNewCustomerId("");
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not open account");
    } finally {
      setSaving(false);
    }
  }

  async function handleTxn(id: string, kind: "deposit" | "withdraw") {
    const amount = Number(txnAmount[id]);
    if (!amount || amount <= 0) return;
    setError(null);
    try {
      if (kind === "deposit") await api.depositSavings(id, amount);
      else await api.withdrawSavings(id, amount);
      setTxnAmount((t) => ({ ...t, [id]: "" }));
      load();
    } catch (err: any) {
      setError(err.message || "Transaction failed");
    }
  }

  function TxnControls({ account }: { account: any }) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min="1"
          placeholder="Amount"
          className="input !py-1.5 !w-24 text-[12px]"
          value={txnAmount[account.id] || ""}
          onChange={(e) => setTxnAmount((t) => ({ ...t, [account.id]: e.target.value }))}
        />
        <button onClick={() => handleTxn(account.id, "deposit")} className="text-[12px] text-green-600 hover:underline active:scale-95 transition-transform">Deposit</button>
        <button onClick={() => handleTxn(account.id, "withdraw")} className="text-[12px] text-rose-600 hover:underline active:scale-95 transition-transform">Withdraw</button>
      </div>
    );
  }

  return (
    <PageShell active="Savings">
      <PageHeader title="Savings" actionLabel={showForm ? "Cancel" : "+ Open account"} onAction={() => setShowForm((s) => !s)} />

      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleOpen} className="border border-paper-100 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 bg-paper-50 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
              <select required className="input" value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)}>
                <option value="">Select…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" disabled={saving || !customers.length} className="w-full sm:w-auto px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm transition-all duration-150 hover:bg-gold-400 active:scale-95 disabled:opacity-60">
            {saving ? "Opening…" : "Open account"}
          </button>
          {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
        </form>
      )}

      <DataTable
        rows={accounts}
        emptyMessage="No savings accounts yet."
        columns={[
          { key: "account", label: "Account", render: (a) => <span className="font-mono text-[12px] text-text-700">{a.accountNumber}</span> },
          { key: "customer", label: "Customer", render: (a) => <span className="text-text-900">{a.customer?.fullName}</span> },
          { key: "balance", label: "Balance", render: (a) => <span className="text-text-700">GHS {Number(a.balance).toLocaleString()}</span> },
          { key: "status", label: "Status", render: (a) => <span className="text-text-500">{a.status}</span> },
          { key: "transact", label: "Transact", render: (a) => <TxnControls account={a} /> },
        ]}
        renderMobileCard={(a) => (
          <>
            <div className="flex items-start justify-between mb-1.5">
              <div className="font-medium text-text-900 text-[15px]">{a.customer?.fullName}</div>
              <span className="font-mono text-[11px] text-text-muted">{a.accountNumber}</span>
            </div>
            <div className="text-[13px] text-text-500 mb-2">GHS {Number(a.balance).toLocaleString()} · {a.status}</div>
            <TxnControls account={a} />
          </>
        )}
      />
    </PageShell>
  );
}
FILE_EOF
echo 'Wrote: web/app/savings/page.tsx'

mkdir -p web/app/onboarding
cat > web/app/onboarding/page.tsx << 'FILE_EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, persistSession } from "@/lib/api";

const INSTITUTION_TYPES: { value: string; label: string }[] = [
  { value: "INDIVIDUAL_SUSU_OPERATOR", label: "Individual Susu Operator" },
  { value: "MICROFINANCE_INSTITUTION", label: "Microfinance Institution" },
  { value: "SAVINGS_AND_LOANS_COMPANY", label: "Savings and Loans Company" },
  { value: "CREDIT_UNION", label: "Credit Union" },
  { value: "COOPERATIVE_SOCIETY", label: "Cooperative Society" },
  { value: "RURAL_COMMUNITY_BANK", label: "Rural / Community Bank" },
  { value: "AGENCY_BANKING_NETWORK", label: "Agency Banking Network" },
  { value: "DIGITAL_LENDING_INSTITUTION", label: "Digital Lending Institution" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    legalName: "",
    tradingName: "",
    type: INSTITUTION_TYPES[1].value,
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.registerInstitution(form);
      const session = await api.login({ email: form.adminEmail, password: form.adminPassword });
      persistSession(session.accessToken, session.refreshToken);
      router.push("/onboarding/details");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper-0 flex items-center justify-center px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl bg-paper-0 border border-paper-100 rounded-lg p-8 shadow-sm"
      >
        <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-rose-600 mb-2">
          Institution Onboarding · Step 1 of 5
        </div>
        <h1 className="font-display font-semibold text-3xl text-ink-900 mb-6">
          Register your institution
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Legal name">
            <input
              required
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Trading name (optional)">
            <input
              value={form.tradingName}
              onChange={(e) => update("tradingName", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Institution type" className="mb-4">
          <select value={form.type} onChange={(e) => update("type", e.target.value)} className="input">
            {INSTITUTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <hr className="my-6 border-paper-100" />
        <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-rose-600 mb-4">
          Administrator account — Chief Executive Officer role
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Full name">
            <input
              required
              value={form.adminFullName}
              onChange={(e) => update("adminFullName", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={form.adminEmail}
              onChange={(e) => update("adminEmail", e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <Field label="Password (min. 8 characters)" className="mb-6">
          <input
            required
            minLength={8}
            type="password"
            value={form.adminPassword}
            onChange={(e) => update("adminPassword", e.target.value)}
            className="input"
          />
        </Field>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition disabled:opacity-60"
        >
          {loading ? "Creating institution…" : "Create institution & continue"}
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] text-text-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
FILE_EOF
echo 'Wrote: web/app/onboarding/page.tsx'

echo ""
echo "== Verifying: web typecheck + build =="
cd web
npm install --silent
npx tsc --noEmit -p tsconfig.json
npx next build
cd ..

echo ""
echo "Done. Restart the web dev server, check on an actual phone or"
echo "DevTools device toolbar, then:"
echo "  git add -A"
echo "  git commit -m \"Mobile-first responsive pass: drawer nav, card tables, deeper navy, animations\""
echo "  git push"
