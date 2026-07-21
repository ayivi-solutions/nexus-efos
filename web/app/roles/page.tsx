"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [granting, setGranting] = useState(false);

  const [form, setForm] = useState({ userId: "", roleId: "", branchId: "", expiresAt: "", isDelegated: false });
  const [employeeForm, setEmployeeForm] = useState({ fullName: "", email: "", branchId: "" });
  const [grantForm, setGrantForm] = useState({ employeeId: "", roleId: "", branchId: "" });

  function load() {
    Promise.all([api.listRoles(), api.listUsers(), api.listBranches(), api.listEmployees()])
      .then(([r, u, b, e]) => {
        setRoles(r.roles);
        setUsers(u.users);
        setBranches(b.branches);
        setEmployees(e.employees);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  const employeesWithoutAccess = employees.filter((e) => !e.userId);

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddingEmployee(true);
    setError(null);
    try {
      await api.createEmployee(employeeForm);
      setEmployeeForm({ fullName: "", email: "", branchId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not add employee");
    } finally {
      setAddingEmployee(false);
    }
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true);
    setError(null);
    try {
      await api.grantAccess(grantForm.employeeId, {
        roleId: grantForm.roleId,
        branchId: grantForm.branchId || undefined,
      });
      setGrantForm({ employeeId: "", roleId: "", branchId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not grant access");
    } finally {
      setGranting(false);
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
    <AppShell active="Roles & Permissions">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-8">Roles and Permissions</h1>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Role definitions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {roles.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="font-display font-semibold text-ink-900 mb-2">{r.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.rolePermissions.map((rp: any) => (
                  <span key={rp.permission.id} className="text-[10.5px] px-2 py-0.5 rounded-full bg-gold-300/25 text-gold-600">{rp.permission.code}</span>
                ))}
              </div>
            </div>
          ))}
          {roles.length === 0 && <p className="text-text-muted text-sm">No roles seeded yet.</p>}
        </div>

        {/* Employee Master — doc §50.5. This is the authoritative directory;
            people must exist here before they can be granted system access. */}
        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Employee directory</h2>
        <form onSubmit={handleAddEmployee} className="card p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
              <input required autoComplete="name" className="input" value={employeeForm.fullName} onChange={(e) => setEmployeeForm((f) => ({ ...f, fullName: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Email</span>
              <input required type="email" autoComplete="email" className="input" value={employeeForm.email} onChange={(e) => setEmployeeForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Branch (optional)</span>
              <select className="input" value={employeeForm.branchId} onChange={(e) => setEmployeeForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Unassigned</option>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={addingEmployee} className="btn-dark">
            {addingEmployee ? "Adding…" : "+ Add employee"}
          </button>
        </form>

        <div className="card overflow-x-auto mb-10">
          <table className="w-full min-w-[600px] text-sm table-modern">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Branch</th><th>System access</th></tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="text-text-900">{e.fullName}</td>
                  <td className="text-text-700">{e.email}</td>
                  <td className="text-text-700">{e.branch?.name || "—"}</td>
                  <td>
                    {e.user ? (
                      <span className="badge bg-green-100 text-green-600">{e.user.status}</span>
                    ) : (
                      <span className="badge bg-violet-500/15 text-violet-500">No access</span>
                    )}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No employees yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Grant access — select an EXISTING employee, never a typed name/email */}
        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Grant system access</h2>
        <form onSubmit={handleGrantAccess} className="card p-6 mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Employee</span>
              <select required className="input" value={grantForm.employeeId} onChange={(e) => setGrantForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Select…</option>
                {employeesWithoutAccess.map((emp) => (<option key={emp.id} value={emp.id}>{emp.fullName}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Role</span>
              <select required className="input" value={grantForm.roleId} onChange={(e) => setGrantForm((f) => ({ ...f, roleId: e.target.value }))}>
                <option value="">Select…</option>
                {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Branch (optional)</span>
              <select className="input" value={grantForm.branchId} onChange={(e) => setGrantForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Unassigned</option>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={granting || employeesWithoutAccess.length === 0} className="btn-primary">
            {granting ? "Granting…" : "Grant access"}
          </button>
          {employeesWithoutAccess.length === 0 && employees.length > 0 && (
            <p className="text-text-muted text-xs mt-2">Every employee already has system access.</p>
          )}
          <p className="text-text-muted text-xs mt-2">The employee sets their own password at /accept-invite using their email.</p>
        </form>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Assign an additional role</h2>
        <form onSubmit={handleAssign} className="card p-6 mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">User</span>
              <select required className="input" value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                <option value="">Select…</option>
                {users.map((u) => (<option key={u.id} value={u.id}>{u.fullName}</option>))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">Role</span>
              <select required className="input" value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}>
                <option value="">Select…</option>
                {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="block text-[13px] text-text-500 mb-1.5">Branch (optional)</span>
              <select className="input" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">All branches</option>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
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
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Assigning…" : "Assign role"}
          </button>
        </form>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Staff and assignments</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm table-modern">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Status</th><th>Roles</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="text-text-900">{u.fullName}</td>
                  <td className="text-text-700">{u.email}</td>
                  <td className="text-text-700">{u.status}</td>
                  <td>
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
                <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No staff yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
