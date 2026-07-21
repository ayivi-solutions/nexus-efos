"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load() {
    api.listAuditLog({
      userId: userId || undefined,
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
    }).then((res) => setLogs(res.logs)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api.listUsers().then((res) => setUsers(res.users)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    downloadCsv("audit-log.csv", logs.map((l) => ({
      time: new Date(l.createdAt).toISOString(),
      user: l.user?.fullName || "System",
      action: l.action,
      resource: l.resource || "",
      resourceId: l.resourceId || "",
    })));
  }

  return (
    <AppShell active="Audit Log">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-2">Audit Log</h1>
        <p className="text-text-muted text-sm mb-6">Read-only. Most recent 500 matching events, newest first (doc §15.5).</p>

        <div className="card p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">User</span>
            <select className="input !py-1.5" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">All users</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.fullName}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">Action contains</span>
            <input className="input !py-1.5 !w-40" placeholder="e.g. loan.approve" value={action} onChange={(e) => setAction(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">From</span>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-text-500 mb-1">To</span>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-dark !py-2">Apply</button>
          <button onClick={exportCsv} disabled={logs.length === 0} className="btn-primary !py-2 ml-auto">Export CSV</button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm table-modern">
            <thead>
              <tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-text-700 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="text-text-900">{l.user?.fullName || "System"}</td>
                  <td className="font-mono text-[12.5px] text-text-700">{l.action}</td>
                  <td className="text-text-700">{l.resource || "—"}{l.resourceId ? ` (${l.resourceId.slice(0, 8)})` : ""}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No matching audit events.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
