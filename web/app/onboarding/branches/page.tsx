"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { OnboardingShell } from "@/components/OnboardingShell";
import { GHANA_REGIONS } from "@/lib/ghana-regions";

export default function OnboardingBranchesPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", code: "", region: "" });
  const [added, setAdded] = useState<{ name: string; code: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.addBranch(form);
      setAdded((a) => [...a, { name: form.name, code: form.code }]);
      setForm({ name: "", code: "", region: "" });
    } catch (err: any) {
      setError(err.message || "Could not add branch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={3} title="Add branches">
      <p className="text-text-500 text-sm mb-5">
        Head Office was created automatically. Add any additional branches — you can always add more later.
      </p>

      {added.length > 0 && (
        <ul className="mb-5 space-y-1.5">
          {added.map((b) => (
            <li key={b.code} className="flex items-center gap-2 text-[13px] text-text-700 bg-paper-50 border border-paper-100 rounded-md px-3 py-2">
              <span className="text-gold-600">✓</span> {b.name} <span className="text-text-muted font-mono">({b.code})</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Branch name</span>
            <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Code</span>
            <input
              required
              className="input uppercase"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. TAM-01"
            />
          </label>
          <label className="block">
            <span className="block text-[13px] text-text-500 mb-1.5">Region</span>
            <select className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
              <option value="">Select…</option>
              {GHANA_REGIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </label>
        </div>

        
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-[10px] border border-ink-900 text-ink-900 font-semibold text-sm hover:bg-ink-900 hover:text-gold-400 transition disabled:opacity-55">
          {loading ? "Adding…" : "+ Add branch"}
        </button>
      </form>

      <div className="flex justify-end">
        <button onClick={() => router.push("/onboarding/staff")} className="btn-dark px-6 py-3">
          Continue
        </button>
      </div>
    </OnboardingShell>
  );
}
