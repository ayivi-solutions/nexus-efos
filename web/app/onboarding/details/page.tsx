"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { OnboardingShell } from "@/components/OnboardingShell";

export default function OnboardingDetailsPage() {
  const router = useRouter();
  const [form, setForm] = useState({ regulatorId: "", region: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.updateDetails(form);
      router.push("/onboarding/branches");
    } catch (err: any) {
      setError(err.message || "Could not save details");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={2} title="Institutional details">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Regulator / license ID</span>
            <input
              className="input"
              value={form.regulatorId}
              onChange={(e) => setForm((f) => ({ ...f, regulatorId: e.target.value }))}
              placeholder="e.g. BoG registration number"
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Region</span>
            <input
              className="input"
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Institutional email</span>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => router.push("/onboarding/branches")}
            className="text-sm text-text-muted hover:text-text-700"
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition disabled:opacity-60"
          >
            {loading ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}
