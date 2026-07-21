"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function DashboardPage() {
  const [institution, setInstitution] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((res) => setInstitution(res.institution))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <AppShell active="Dashboard">
      <div className="p-5 dt:p-10">
        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
        {!institution && !error && <p className="text-text-muted text-sm">Loading institution…</p>}

        {institution && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {institution.type.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-3xl dt:text-4xl text-ink-900 mb-8">{institution.legalName}</h1>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <Stat label="Onboarding step" value={`${institution.onboardingStep} / 5`} />
              <Stat label="Status" value={institution.status.replaceAll("_", " ")} />
              <Stat label="Branches" value={String(institution.branches?.length ?? 0)} />
              <Stat label="Region" value={institution.region || "—"} />
            </div>

            <div className="border border-paper-100 rounded-lg p-6">
              <h2 className="font-display font-semibold text-lg text-ink-900 mb-2">Core platform prototype</h2>
              <p className="text-text-700 text-[15px] leading-relaxed">
                Auth, RBAC, institution onboarding, Customers, Loans, Savings, Branches, Roles &amp;
                Permissions and the Audit Log are all live. The bottom navigation adapts to your
                permissions automatically.
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
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
