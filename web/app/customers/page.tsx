"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

const STAGES = [
  "AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT",
];

const KYC_STATUSES = ["PENDING", "VERIFIED", "REJECTED"];

const STAGE_COLOR: Record<string, string> = {
  AWARENESS: "bg-violet-500/15 text-violet-500",
  ACQUISITION: "bg-violet-500/15 text-violet-500",
  ONBOARDING: "bg-violet-500/15 text-violet-500",
  ACTIVATION: "bg-gold-500/15 text-gold-600",
  GROWTH: "bg-green-100 text-green-600",
  RETENTION: "bg-green-100 text-green-600",
  ADVOCACY: "bg-green-100 text-green-600",
  RE_ENGAGEMENT: "bg-rose-100 text-rose-600",
};

const KYC_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  VERIFIED: "bg-green-100 text-green-600",
  REJECTED: "bg-rose-100 text-rose-600",
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function load() {
    api
      .listCustomers()
      .then((res) => setCustomers(res.customers))
      .catch((err) => setError(err.message));
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

  async function handleStageChange(id: string, lifecycleStage: string) {
    setUpdatingId(id);
    setError(null);
    try {
      await api.updateCustomerStage(id, lifecycleStage);
      load();
    } catch (err: any) {
      setError(err.message || "Could not update stage");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleKycChange(id: string, kycStatus: string) {
    setUpdatingId(id);
    setError(null);
    try {
      await api.updateCustomerKyc(id, kycStatus);
      load();
    } catch (err: any) {
      setError(err.message || "Could not update KYC status");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-screen flex bg-paper-0">
      <Sidebar active="Customers" />
      <main className="flex-1 p-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-semibold text-3xl text-ink-900">Customers</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
          >
            {showForm ? "Cancel" : "+ New customer"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                <input
                  required
                  className="input"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                <input
                  required
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Email (optional)</span>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
                <select
                  className="input"
                  value={form.segment}
                  onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                >
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : "Create customer"}
            </button>
          </form>
        )}

        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">KYC</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-900">{c.fullName}</td>
                  <td className="px-4 py-3 text-text-700">{c.phone}</td>
                  <td className="px-4 py-3 text-text-700">{c.segment.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3">
                    <select
                      disabled={updatingId === c.id}
                      value={c.lifecycleStage}
                      onChange={(e) => handleStageChange(c.id, e.target.value)}
                      className={`text-[11px] px-2 py-1 rounded-full border-0 cursor-pointer disabled:opacity-50 ${STAGE_COLOR[c.lifecycleStage] || ""}`}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      disabled={updatingId === c.id}
                      value={c.kycStatus}
                      onChange={(e) => handleKycChange(c.id, e.target.value)}
                      className={`text-[11px] px-2 py-1 rounded-full border-0 cursor-pointer disabled:opacity-50 ${KYC_COLOR[c.kycStatus] || ""}`}
                    >
                      {KYC_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
