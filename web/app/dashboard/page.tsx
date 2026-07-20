"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

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
    <div className="min-h-screen flex flex-col md:flex-row bg-paper-0">
      <Sidebar active="Overview" />

      <main className="flex-1 p-5 md:p-10 overflow-x-auto">
        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
        {!institution && !error && <p className="text-text-muted text-sm">Loading institution…</p>}

        {institution && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {institution.type.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-4xl text-ink-900 mb-8">{institution.legalName}</h1>

            {institution.onboardingStep < 5 && (
              <button
                onClick={() =>
                  router.push(
                    ["", "onboarding", "onboarding/details", "onboarding/branches", "onboarding/staff", "onboarding/go-live"][
                      institution.onboardingStep
                    ]
                  )
                }
                className="mb-8 w-full text-left px-4 py-3 rounded-md bg-gold-300/30 border border-gold-500/40 text-ink-900 text-sm hover:bg-gold-300/50 transition"
              >
                Onboarding is at step {institution.onboardingStep} of 5 — continue setup →
              </button>
            )}

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
