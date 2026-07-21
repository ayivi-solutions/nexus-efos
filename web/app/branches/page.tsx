"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", region: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listBranches().then((res) => setBranches(res.branches)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createBranch(form);
      setForm({ name: "", code: "", region: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not create branch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell active="Branches">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-8">Branches</h1>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Name</span>
              <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Code</span>
              <input required className="input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Region (optional)</span>
              <input className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </label>
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60">
            {saving ? "Saving…" : "Add branch"}
          </button>
        </form>

        <div className="border border-paper-100 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-900">{b.name}</td>
                  <td className="px-4 py-3 text-text-700">{b.code}</td>
                  <td className="px-4 py-3 text-text-700">{b.region || "—"}</td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-text-muted text-sm">No branches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
