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

        <style jsx global>{`
          .input {
            width: 100%;
            border: 1px solid #ece4d4;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 14px;
            background: #fff;
          }
          .input:focus {
            outline: 2px solid #d59535;
            outline-offset: 1px;
          }
        `}</style>
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
