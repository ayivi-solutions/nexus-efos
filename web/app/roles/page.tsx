"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

export default function RolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ userId: "", roleId: "", branchId: "", expiresAt: "", isDelegated: false });
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", roleId: "", branchId: "" });

  function load() {
    Promise.all([api.listRoles(), api.listUsers(), api.listBranches()])
      .then(([r, u, b]) => {
        setRoles(r.roles);
        setUsers(u.users);
        setBranches(b.branches);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await api.inviteStaff({
        fullName: inviteForm.fullName,
        email: inviteForm.email,
        roleId: inviteForm.roleId,
        branchId: inviteForm.branchId || undefined,
      });
      setInviteForm({ fullName: "", email: "", roleId: "", branchId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not invite staff");
    } finally {
      setInviting(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.assignRole({
        userId: form.userId,
        roleId: form.roleId,
        branchId: form.branchId || undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        isDelegated: form.isDelegated,
      });
      setForm({ userId: "", roleId: "", branchId: "", expiresAt: "", isDelegated: false });
      load();
    } catch (err: any) {
      setError(err.message || "Could not assign role");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(userRoleId: string) {
    setError(null);
    try {
      await api.revokeRole(userRoleId);
      load();
    } catch (err: any) {
      setError(err.message || "Could not revoke role");
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper-0">
      <Sidebar active="Roles & Permissions" />
      <main className="flex-1 p-5 md:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-3xl text-ink-900 mb-8">Roles and Permissions</h1>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Role definitions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {roles.map((r) => (
            <div key={r.id} className="border border-paper-100 rounded-lg p-4 bg-paper-50">
              <div className="font-display font-semibold text-ink-900 mb-2">{r.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.rolePermissions.map((rp: any) => (
                  <span key={rp.permission.id} className="text-[10.5px] px-2 py-0.5 rounded-full bg-gold-300/25 text-gold-600">
                    {rp.permission.code}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {roles.length === 0 && <p className="text-text-muted text-sm">No roles seeded yet.</p>}
        </div>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Invite staff</h2>
        <form onSubmit={handleInvite} className="border border-paper-100 rounded-lg p-6 mb-10 bg-paper-50">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
              <input required className="input" value={inviteForm.fullName} onChange={(e) => setInviteForm((f) => ({ ...f, fullName: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Email</span>
              <input required type="email" className="input" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Role</span>
              <select required className="input" value={inviteForm.roleId} onChange={(e) => setInviteForm((f) => ({ ...f, roleId: e.target.value }))}>
                <option value="">Select...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Branch (optional)</span>
              <select className="input" value={inviteForm.branchId} onChange={(e) => setInviteForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Unassigned</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition disabled:opacity-60"
          >
            {inviting ? "Inviting..." : "Send invite"}
          </button>
          <p className="text-text-muted text-xs mt-2">
            The invited user sets their own password at /accept-invite using this email.
          </p>
        </form>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Assign a role</h2>
        <form onSubmit={handleAssign} className="border border-paper-100 rounded-lg p-6 mb-10 bg-paper-50">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">User</span>
              <select required className="input" value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                <option value="">Select...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">Role</span>
              <select required className="input" value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}>
                <option value="">Select...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">Branch (optional)</span>
              <select className="input" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">Expires (optional)</span>
              <input type="date" className="input" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </label>
            <label className="flex items-end gap-2 sm:col-span-1 pb-2.5">
              <input type="checkbox" checked={form.isDelegated} onChange={(e) => setForm((f) => ({ ...f, isDelegated: e.target.checked }))} />
              <span className="text-[13px] text-text-500">Temporary delegation</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
          >
            {saving ? "Assigning..." : "Assign role"}
          </button>
        </form>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Staff and assignments</h2>
        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Roles</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-paper-100 align-top">
                  <td className="px-4 py-3 text-text-900">{u.fullName}</td>
                  <td className="px-4 py-3 text-text-700">{u.email}</td>
                  <td className="px-4 py-3 text-text-700">{u.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.userRoles.map((ur: any) => (
                        <span key={ur.id} className="text-[10.5px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-500 flex items-center gap-1">
                          {ur.role.name}
                          {ur.branch ? ` - ${ur.branch.name}` : ""}
                          {ur.expiresAt ? ` - exp ${new Date(ur.expiresAt).toLocaleDateString()}` : ""}
                          <button onClick={() => handleRevoke(ur.id)} className="text-rose-600 font-bold ml-1">x</button>
                        </span>
                      ))}
                      {u.userRoles.length === 0 && <span className="text-text-muted text-xs">No roles assigned</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted text-sm">
                    No staff yet.
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
