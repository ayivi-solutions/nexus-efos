"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, persistSession } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";

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

// Institution registration used to be reachable by anyone who found this
// URL. Now gated behind a shared setup key — this client-side check is
// purely UX (hides the form from casual visitors who don't have the key);
// the real enforcement is server-side in POST /auth/register-institution,
// which rejects regardless of what this page does. Visit as
// /onboarding?key=<the actual key> to reach the form at all.
function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupKey = searchParams.get("key");

  const [form, setForm] = useState({
    legalName: "",
    tradingName: "",
    type: INSTITUTION_TYPES[1].value,
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!setupKey) {
      router.replace("/login");
    }
  }, [setupKey, router]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.registerInstitution({ ...form, setupKey: setupKey! });
      const session = await api.login({ email: form.adminEmail, password: form.adminPassword });
      persistSession(session.accessToken, session.refreshToken);
      router.push("/onboarding/details");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (!setupKey) return null;

  return (
    <main className="min-h-screen bg-paper-0 flex items-center justify-center px-6 py-12">
      <form onSubmit={handleSubmit} className="w-full max-w-xl card p-8">
        <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-rose-600 mb-2">
          Institution Onboarding · Step 1 of 5
        </div>
        <h1 className="font-display font-semibold text-3xl text-ink-900 mb-6">Register your institution</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Legal name">
            <input
              required
              autoComplete="organization"
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Trading name (optional)">
            <input
              autoComplete="organization"
              value={form.tradingName}
              onChange={(e) => update("tradingName", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Institution type" className="mb-4">
          <select value={form.type} onChange={(e) => update("type", e.target.value)} className="input">
            {INSTITUTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
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
              autoComplete="name"
              value={form.adminFullName}
              onChange={(e) => update("adminFullName", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              autoComplete="email"
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
            autoComplete="new-password"
            value={form.adminPassword}
            onChange={(e) => update("adminPassword", e.target.value)}
            className="input"
          />
        </Field>

        <button type="submit" disabled={loading} className="btn-dark w-full py-3">
          {loading ? "Creating institution…" : "Create institution & continue"}
        </button>
      </form>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] text-text-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
