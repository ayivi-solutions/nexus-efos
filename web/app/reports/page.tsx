"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";

const REPORTS = [
  { href: "/reports/loans", title: "Loan Portfolio Report", desc: "By branch, by status, aging analysis, full ledger export." },
  { href: "/reports/savings", title: "Savings Report", desc: "Balances by branch, net deposit/withdrawal flow, top accounts." },
  { href: "/reports/collections", title: "Collections Report", desc: "Collector and route performance, cash settlement, exceptions, commission." },
  { href: "/reports/customers", title: "Customer Report", desc: "Segmentation, lifecycle funnel, KYC compliance rate, branch mix." },
  { href: "/reports/cheques", title: "Cheque Register Report", desc: "Volume by status/direction, bounce rate, pending confirmation." },
  { href: "/reports/customer-care", title: "Customer Care Report", desc: "Interaction volume by channel, complaint resolution time, escalation rate." },
  { href: "/reports/hr", title: "HR Report", desc: "Attendance corrections, performance review completion, disciplinary outcomes." },
  { href: "/reports/internal-audit", title: "Internal Audit Report", desc: "Findings by risk, overdue rate, engagement status breakdown." },
  { href: "/capital-adequacy", title: "Capital Adequacy", desc: "CAR, RWA, NPL vs. ceiling, credit concentration risk — live dashboard, not a static report." },
  { href: "/analytics", title: "Financial & Portfolio Analytics", desc: "GL trends, branch performance, portfolio PAR/aging/concentration — live dashboard." },
];

export default function ReportsPage() {
  return (
    <AppShell active="Reports">
      <div className="p-5 dt:p-10">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-2">Reports</h1>
        <p className="text-text-muted text-sm mb-8">Operational, customer and financial reporting (doc §80.5).</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {REPORTS.map((r) => (
            <Link key={r.href} href={r.href} className="card p-5 hover:shadow-[0_4px_16px_rgba(200,169,81,0.18)] transition">
              <div className="font-display font-semibold text-ink-900 mb-1.5">{r.title}</div>
              <p className="text-text-500 text-[13px] leading-relaxed">{r.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
