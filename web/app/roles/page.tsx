"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [saving, setSaving] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [granting, setGranting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);

  const [form, setForm] = useState({ userId: "", roleId: "", branchId: "", expiresAt: "", isDelegated: false });
  const [employeeForm, setEmployeeForm] = useState({ fullName: "", email: "", branchId: "", employeeNumber: "", positionId: "", departmentId: "", employmentType: "PERMANENT" });
  const [grantForm, setGrantForm] = useState({ employeeId: "", roleId: "", branchId: "" });

  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editEmployeeForm, setEditEmployeeForm] = useState({ fullName: "", email: "", branchId: "", employeeNumber: "", positionId: "", departmentId: "" });

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRolePermCodes, setEditRolePermCodes] = useState<string[]>([]);
  const [editRoleRequireMfa, setEditRoleRequireMfa] = useState(false);

  const [showNewRole, setShowNewRole] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleForm, setNewRoleForm] = useState({ name: "", description: "", category: "OPERATIONAL", requireMfa: false });
  const [newRolePermCodes, setNewRolePermCodes] = useState<string[]>([]);

  const [showArchivedEmployees, setShowArchivedEmployees] = useState(false);

  function load() {
    Promise.all([
      api.listRoles(),
      api.listUsers(),
      api.listBranches(),
      api.listEmployees(showArchivedEmployees),
      api.listPermissions(),
      api.listDepartments(),
      api.listPositions(),
    ])
      .then(([r, u, b, e, p, d, pos]) => {
        setRoles(r.roles);
        setUsers(u.users);
        setBranches(b.branches);
        setEmployees(e.employees);
        setPermissions(p.permissions);
        setDepartments(d.departments);
        setPositions(pos.positions);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [showArchivedEmployees]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleQuickAddDepartment() {
    const name = window.prompt("New department name:");
    if (!name) return;
    try {
      const res = await api.createDepartment({ name });
      setDepartments((d) => [...d, res.department]);
      setEmployeeForm((f) => ({ ...f, departmentId: res.department.id }));
    } catch (err: any) {
      setError(err.message || "Could not create department");
    }
  }

  async function handleQuickAddPosition() {
    const title = window.prompt("New position title:");
    if (!title) return;
    try {
      const res = await api.createPosition({ title, departmentId: employeeForm.departmentId || undefined });
      setPositions((p) => [...p, res.position]);
      setEmployeeForm((f) => ({ ...f, positionId: res.position.id }));
    } catch (err: any) {
      setError(err.message || "Could not create position");
    }
  }

  const employeesWithoutAccess = employees.filter((e) => !e.userId && e.status !== "INACTIVE");

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddingEmployee(true);
    setError(null);
    try {
      await api.createEmployee(employeeForm);
      setEmployeeForm({ fullName: "", email: "", branchId: "", employeeNumber: "", positionId: "", departmentId: "", employmentType: "PERMANENT" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not add employee");
    } finally {
      setAddingEmployee(false);
    }
  }

  function startEditEmployee(emp: any) {
    setEditingEmployeeId(emp.id);
    setEditEmployeeForm({ fullName: emp.fullName, email: emp.email, branchId: emp.branchId || "", employeeNumber: emp.employeeNumber || "", positionId: emp.positionId || "", departmentId: emp.departmentId || "" });
  }

  async function saveEditEmployee(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const current = employees.find((e) => e.id === id);
      await api.updateEmployee(id, { ...editEmployeeForm, branchId: editEmployeeForm.branchId || null, expectedVersion: current?.versionNo });
      setEditingEmployeeId(null);
      load();
    } catch (err: any) {
      if (err.message?.includes("changed by someone else")) {
        setError("Someone else updated this employee while you were editing. The list has been refreshed — please redo your changes.");
        setEditingEmployeeId(null);
        load();
      } else {
        setError(err.message || "Could not update employee");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function toggleArchiveEmployee(emp: any) {
    setBusyId(emp.id);
    setError(null);
    try {
      if (emp.status === "INACTIVE") await api.unarchiveEmployee(emp.id);
      else await api.archiveEmployee(emp.id);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuspendUser(userId: string, currentStatus: string) {
    setBusyId(userId);
    setError(null);
    try {
      if (currentStatus === "SUSPENDED") await api.reinstateUser(userId);
      else await api.suspendUser(userId);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  function startEditRole(role: any) {
    setEditingRoleId(role.id);
    setEditRolePermCodes(role.rolePermissions.map((rp: any) => rp.permission.code));
    setEditRoleRequireMfa(!!role.requireMfa);
  }

  function togglePermCode(code: string) {
    setEditRolePermCodes((codes) => (codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]));
  }

  function toggleNewRolePermCode(code: string) {
    setNewRolePermCodes((codes) => (codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]));
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setCreatingRole(true);
    setError(null);
    try {
      await api.createRole({ ...newRoleForm, permissionCodes: newRolePermCodes });
      setNewRoleForm({ name: "", description: "", category: "OPERATIONAL", requireMfa: false });
      setNewRolePermCodes([]);
      setShowNewRole(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create role");
    } finally {
      setCreatingRole(false);
    }
  }

  async function saveRolePermissions(roleId: string) {
    setBusyId(roleId);
    setError(null);
    try {
      const current = roles.find((r) => r.id === roleId);
      await api.updateRole(roleId, {
        permissionCodes: editRolePermCodes,
        requireMfa: editRoleRequireMfa,
        expectedVersion: current?.versionNo,
      });
      setEditingRoleId(null);
      load();
    } catch (err: any) {
      if (err.message?.includes("changed by someone else")) {
        setError("Someone else updated this role while you were editing. The list has been refreshed — please redo your changes.");
        setEditingRoleId(null);
        load();
      } else {
        setError(err.message || "Could not update role");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true);
    setError(null);
    setLastInviteLink(null);
    try {
      const res = await api.grantAccess(grantForm.employeeId, { roleId: grantForm.roleId, branchId: grantForm.branchId || undefined });
      setLastInviteLink(res.inviteLink);
      setGrantForm({ employeeId: "", roleId: "", branchId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Could not grant access");
    } finally {
      setGranting(false);
    }
  }

  function copyInviteLink() {
    if (!lastInviteLink) return;
    navigator.clipboard.writeText(lastInviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        {error && null}

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-ink-900">Role definitions</h2>
          <button onClick={() => setShowNewRole((s) => !s)} className="btn-dark !py-2">
            {showNewRole ? "Cancel" : "+ New role"}
          </button>
        </div>

        {showNewRole && (
          <form onSubmit={handleCreateRole} className="card p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Role name</span>
                <input required className="input" value={newRoleForm.name} onChange={(e) => setNewRoleForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Description (optional)</span>
                <input className="input" value={newRoleForm.description} onChange={(e) => setNewRoleForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Category</span>
                <select className="input" value={newRoleForm.category} onChange={(e) => setNewRoleForm((f) => ({ ...f, category: e.target.value }))}>
                  <option value="EXECUTIVE">Executive</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="GOVERNANCE">Governance</option>
                  <option value="TECHNICAL">Technical</option>
                  <option value="CUSTOMER">Customer</option>
                </select>
              </label>
            </div>
            <div className="mb-4">
              <span className="block text-[13px] text-text-500 mb-1.5">Permissions</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto card p-3">
                {permissions.map((p: any) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-[11px] text-text-700">
                    <input type="checkbox" checked={newRolePermCodes.includes(p.code)} onChange={() => toggleNewRolePermCode(p.code)} />
                    {p.code}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 mb-4 text-[13px] text-text-700">
              <input
                type="checkbox"
                checked={newRoleForm.requireMfa}
                onChange={(e) => setNewRoleForm((f) => ({ ...f, requireMfa: e.target.checked }))}
              />
              Require two-factor authentication for this role
            </label>
            <button type="submit" disabled={creatingRole} className="btn-primary">{creatingRole ? "Creating…" : "Create role"}</button>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {roles.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="font-display font-semibold text-ink-900">{r.name}</div>
                  {r.requireMfa && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 font-semibold">2FA required</span>
                  )}
                </div>
                {editingRoleId === r.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => saveRolePermissions(r.id)} disabled={busyId === r.id} className="text-[11.5px] text-green-600 font-semibold">Save</button>
                    <button onClick={() => setEditingRoleId(null)} className="text-[11.5px] text-text-muted">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => startEditRole(r)} className="text-[11.5px] text-gold-600 font-semibold">Edit</button>
                )}
              </div>

              {editingRoleId === r.id && (
                <label className="flex items-center gap-2 mb-2 text-[12px] text-text-700">
                  <input type="checkbox" checked={editRoleRequireMfa} onChange={(e) => setEditRoleRequireMfa(e.target.checked)} />
                  Require two-factor authentication for this role
                </label>
              )}

              {editingRoleId === r.id ? (
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {permissions.map((p: any) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-[11px] text-text-700">
                      <input type="checkbox" checked={editRolePermCodes.includes(p.code)} onChange={() => togglePermCode(p.code)} />
                      {p.code}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {r.rolePermissions.map((rp: any) => (
                    <span key={rp.permission.id} className="text-[10.5px] px-2 py-0.5 rounded-full bg-gold-300/25 text-gold-600">{rp.permission.code}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {roles.length === 0 && <p className="text-text-muted text-sm">No roles seeded yet.</p>}
        </div>

        {/* Employee Master — doc §50.5 / §71 */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-ink-900">Employee directory</h2>
          <label className="flex items-center gap-1.5 text-[12.5px] text-text-500">
            <input type="checkbox" checked={showArchivedEmployees} onChange={(e) => setShowArchivedEmployees(e.target.checked)} />
            Show archived
          </label>
        </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Employee number (optional)</span>
              <input className="input" value={employeeForm.employeeNumber} onChange={(e) => setEmployeeForm((f) => ({ ...f, employeeNumber: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Position (optional)</span>
              <select className="input" value={employeeForm.positionId} onChange={(e) => setEmployeeForm((f) => ({ ...f, positionId: e.target.value }))}>
                <option value="">— None —</option>
                {positions.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
              </select>
              <button type="button" onClick={handleQuickAddPosition} className="btn-text text-gold-600 mt-1">+ New position</button>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Department (optional)</span>
              <select className="input" value={employeeForm.departmentId} onChange={(e) => setEmployeeForm((f) => ({ ...f, departmentId: e.target.value }))}>
                <option value="">— None —</option>
                {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
              </select>
              <button type="button" onClick={handleQuickAddDepartment} className="btn-text text-gold-600 mt-1">+ New department</button>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Employment type</span>
              <select className="input" value={employeeForm.employmentType} onChange={(e) => setEmployeeForm((f) => ({ ...f, employmentType: e.target.value }))}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="TEMPORARY">Temporary</option>
                <option value="INTERN">Intern</option>
                <option value="CONSULTANT">Consultant</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={addingEmployee} className="btn-dark">{addingEmployee ? "Adding…" : "+ Add employee"}</button>
        </form>

        <div className="card overflow-x-auto mb-10">
          <table className="w-full min-w-[700px] text-sm table-modern">
            <thead><tr><th>Name</th><th>Emp. No.</th><th>Position</th><th>Email</th><th>Branch</th><th>System access</th><th>Actions</th></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  {editingEmployeeId === e.id ? (
                    <>
                      <td><input className="input !py-1 !text-[12px]" value={editEmployeeForm.fullName} onChange={(ev) => setEditEmployeeForm((f) => ({ ...f, fullName: ev.target.value }))} /></td>
                      <td><input className="input !py-1 !text-[12px] !w-24" value={editEmployeeForm.employeeNumber} onChange={(ev) => setEditEmployeeForm((f) => ({ ...f, employeeNumber: ev.target.value }))} /></td>
                      <td>
                        <select className="input !py-1 !text-[12px] !w-28" value={editEmployeeForm.positionId} onChange={(ev) => setEditEmployeeForm((f) => ({ ...f, positionId: ev.target.value }))}>
                          <option value="">—</option>
                          {positions.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
                        </select>
                      </td>
                      <td><input className="input !py-1 !text-[12px]" value={editEmployeeForm.email} onChange={(ev) => setEditEmployeeForm((f) => ({ ...f, email: ev.target.value }))} /></td>
                      <td>
                        <select className="input !py-1 !text-[12px]" value={editEmployeeForm.branchId} onChange={(ev) => setEditEmployeeForm((f) => ({ ...f, branchId: ev.target.value }))}>
                          <option value="">Unassigned</option>
                          {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                        </select>
                      </td>
                      <td>{e.user ? <span className="badge bg-green-100 text-green-600">{e.user.status}</span> : <span className="badge bg-violet-500/15 text-violet-500">No access</span>}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button onClick={() => saveEditEmployee(e.id)} disabled={busyId === e.id} className="btn-text text-green-600">Save</button>
                        <button onClick={() => setEditingEmployeeId(null)} className="btn-text text-text-muted">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={e.status === "INACTIVE" ? "text-text-muted line-through" : "text-text-900"}>{e.fullName}</td>
                      <td className="text-text-700 font-mono text-[12px]">{e.employeeNumber || "—"}</td>
                      <td className="text-text-700">{e.position?.title || "—"}</td>
                      <td className="text-text-700">{e.email}</td>
                      <td className="text-text-700">{e.branch?.name || "—"}</td>
                      <td>{e.user ? <span className="badge bg-green-100 text-green-600">{e.user.status}</span> : <span className="badge bg-violet-500/15 text-violet-500">No access</span>}</td>
                      <td className="whitespace-nowrap space-x-2">
                        <button onClick={() => startEditEmployee(e)} className="btn-text text-gold-600">Edit</button>
                        <button onClick={() => toggleArchiveEmployee(e)} disabled={busyId === e.id} className={`btn-text ${e.status === "INACTIVE" ? "text-green-600" : "text-rose-600"}`}>
                          {e.status === "INACTIVE" ? "Unarchive" : "Archive"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No employees yet.</td></tr>}
            </tbody>
          </table>
        </div>

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
          <button type="submit" disabled={granting || employeesWithoutAccess.length === 0} className="btn-primary">{granting ? "Granting…" : "Grant access"}</button>
          {employeesWithoutAccess.length === 0 && employees.length > 0 && <p className="text-text-muted text-xs mt-2">Every active employee already has system access.</p>}
          {lastInviteLink && (
            <div className="mt-4 p-3 rounded-md bg-gold-300/10 border border-gold-500/25">
              <p className="text-[12.5px] text-text-700 mb-2">Share this link with them (expires in 7 days):</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-[11.5px] bg-white border border-paper-100 rounded px-2 py-1.5 break-all">{lastInviteLink}</code>
                <button type="button" onClick={copyInviteLink} className="btn-dark shrink-0 !px-3 !py-1.5 !text-[12px]">{copied ? "Copied!" : "Copy"}</button>
              </div>
            </div>
          )}
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
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Assigning…" : "Assign role"}</button>
        </form>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Staff and assignments</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm table-modern">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Roles</th><th>Access</th></tr></thead>
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
                          {ur.role.name}{ur.branch ? ` - ${ur.branch.name}` : ""}{ur.expiresAt ? ` - exp ${new Date(ur.expiresAt).toLocaleDateString()}` : ""}
                          <button onClick={() => handleRevoke(ur.id)} className="text-rose-600 font-bold ml-1">x</button>
                        </span>
                      ))}
                      {u.userRoles.length === 0 && <span className="text-text-muted text-xs">No roles assigned</span>}
                    </div>
                  </td>
                  <td>
                    {u.status !== "INVITED" && (
                      <button onClick={() => toggleSuspendUser(u.id, u.status)} disabled={busyId === u.id} className={`btn-text ${u.status === "SUSPENDED" ? "text-green-600" : "text-rose-600"}`}>
                        {u.status === "SUSPENDED" ? "Reinstate" : "Suspend"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No staff yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
