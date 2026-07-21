"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { GHANA_REGIONS } from "@/lib/ghana-regions";

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", region: "" });
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", region: "" });

  function load() {
    api.listBranches(showArchived).then((res) => setBranches(res.branches)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.createBranch(form);
      setForm({ name: "", code: "", region: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not create branch"); }
    finally { setSaving(false); }
  }

  function startEdit(b: any) {
    setEditingId(b.id);
    setEditForm({ name: b.name, code: b.code, region: b.region || "" });
  }

  async function saveEdit(id: string) {
    setBusyId(id); setError(null);
    try {
      await api.updateBranch(id, editForm);
      setEditingId(null);
      load();
    } catch (err: any) { setError(err.message || "Could not update branch"); }
    finally { setBusyId(null); }
  }

  async function toggleArchive(b: any) {
    setBusyId(b.id); setError(null);
    try {
      if (b.archived) await api.unarchiveBranch(b.id);
      else await api.archiveBranch(b.id);
      load();
    } catch (err: any) { setError(err.message || "Action failed"); }
    finally { setBusyId(null); }
  }

  return (
    <AppShell active="Branches">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-8 gap-3">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Branches</h1>
          <label className="flex items-center gap-1.5 text-[12.5px] text-text-500">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <form onSubmit={handleCreate} className="card p-6 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Name</span>
              <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Code</span>
              <input required className="input uppercase" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. TAM-01" />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Region</span>
              <select className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
                <option value="">Select…</option>
                {GHANA_REGIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Add branch"}</button>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm table-modern">
            <thead><tr><th>Name</th><th>Code</th><th>Region</th><th>Actions</th></tr></thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  {editingId === b.id ? (
                    <>
                      <td><input className="input !py-1 !text-[12px]" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></td>
                      <td><input className="input !py-1 !text-[12px] uppercase" value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /></td>
                      <td>
                        <select className="input !py-1 !text-[12px]" value={editForm.region} onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}>
                          <option value="">Select…</option>
                          {GHANA_REGIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap space-x-2">
                        <button onClick={() => saveEdit(b.id)} disabled={busyId === b.id} className="btn-text text-green-600">Save</button>
                        <button onClick={() => setEditingId(null)} className="btn-text text-text-muted">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={b.archived ? "text-text-muted line-through" : "text-text-900"}>{b.name}{b.isHeadOffice && <span className="badge bg-gold-300/25 text-gold-600 ml-2">HQ</span>}</td>
                      <td className="text-text-700 font-mono text-[12px]">{b.code}</td>
                      <td className="text-text-700">{b.region || "—"}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button onClick={() => startEdit(b)} className="btn-text text-gold-600">Edit</button>
                        {!b.isHeadOffice && (
                          <button onClick={() => toggleArchive(b)} disabled={busyId === b.id} className={`btn-text ${b.archived ? "text-green-600" : "text-rose-600"}`}>
                            {b.archived ? "Unarchive" : "Archive"}
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {branches.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No branches yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
