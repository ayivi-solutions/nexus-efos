"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const NAV = [
  { label: "Overview", icon: "◆" },
  { label: "Customers", icon: "○" },
  { label: "Loans", icon: "▢" },
  { label: "Savings", icon: "▣" },
  { label: "Branches", icon: "▤" },
  { label: "Roles & Permissions", icon: "◈" },
  { label: "Audit Log", icon: "▥" },
];

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
    <div className="min-h-screen flex bg-paper-0">
      <aside className="w-[260px] bg-ink-900 text-paper-50 flex flex-col shrink-0">
        <div className="h-14 flex items-center gap-2 px-5 border-b" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
          <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #E8B563" }} />
          <span className="font-mono text-sm tracking-wide">
            NEXUS <b className="text-gold-400">EFOS</b>
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item, i) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition ${
                i === 0 ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#E8B563]" : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
              }`}
            >
              <span className="text-gold-500">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t text-[11px] text-violet-500" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
          Core Platform · Working Draft v0.1
        </div>
      </aside>

      <main className="flex-1 p-10">
        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
        {!institution && !error && <p className="text-text-muted text-sm">Loading institution…</p>}

        {institution && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {institution.type.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-4xl text-ink-900 mb-8">{institution.legalName}</h1>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <Stat label="Onboarding step" value={`${institution.onboardingStep} / 5`} />
              <Stat label="Status" value={institution.status.replaceAll("_", " ")} />
              <Stat label="Branches" value={String(institution.branches?.length ?? 0)} />
              <Stat label="Region" value={institution.region || "—"} />
            </div>

            <div className="border border-paper-100 rounded-lg p-6">
              <h2 className="font-display font-semibold text-lg text-ink-900 mb-2">Core platform prototype</h2>
              <p className="text-text-700 text-[15px] leading-relaxed">
                Auth, RBAC and institution onboarding are live. Next up per the roadmap: complete
                onboarding steps 2–5 (details, branches, staff invites, go-live) in the UI, then
                Enterprise Services (§21 Layer 2) — Customer Management, Savings, Loans.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-50 border border-paper-100 rounded-md p-3.5">
      <div className="font-display font-semibold text-xl text-gold-600">{value}</div>
      <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
