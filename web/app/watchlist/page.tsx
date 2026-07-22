"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function WatchlistPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [form, setForm] = useState({ fullName: "", idNumber: "", reason: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listWatchlist().then((res) => setEntries(res.entries)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addWatchlistEntry({ fullName: form.fullName, idNumber: form.idNumber || undefined, reason: form.reason || undefined });
      setForm({ fullName: "", idNumber: "", reason: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not add entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.deleteWatchlistEntry(id);
      load();
    } catch (err: any) {
      setError(err.message || "Could not remove entry");
    }
  }

  return (
    <AppShell active="Watchlist">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-2">Watchlist</h1>
        <p className="text-text-muted text-sm mb-6">doc §34 — screened automatically against every new customer's name at creation. A match flags the record for review; it does not block onboarding.</p>

        <form onSubmit={handleAdd} className="card p-6 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <input required placeholder="Full name" className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            <input placeholder="ID number (optional)" className="input" value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} />
            <input placeholder="Reason (optional)" className="input" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Adding…" : "Add to watchlist"}</button>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm table-modern">
            <thead><tr><th>Name</th><th>ID number</th><th>Reason</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="text-text-900">{e.fullName}</td>
                  <td className="text-text-700">{e.idNumber || "—"}</td>
                  <td className="text-text-700">{e.reason || "—"}</td>
                  <td className="text-text-700 whitespace-nowrap">{new Date(e.createdAt).toLocaleDateString()}</td>
                  <td><button onClick={() => handleRemove(e.id)} className="btn-text text-rose-600">Remove</button></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">Watchlist is empty.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
