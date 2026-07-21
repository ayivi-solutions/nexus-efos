"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listAuditLog().then((res) => setLogs(res.logs)).catch((err) => setError(err.message));
  }, []);

  return (
    <AppShell active="Audit Log">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-2">Audit Log</h1>
        <p className="text-text-muted text-sm mb-8">Read-only. Most recent 200 events, newest first.</p>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm table-modern">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Resource</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-700 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-900">{l.user?.fullName || "System"}</td>
                  <td className="px-4 py-3 font-mono text-[12.5px] text-text-700">{l.action}</td>
                  <td className="px-4 py-3 text-text-700">{l.resource || "—"}{l.resourceId ? ` (${l.resourceId.slice(0, 8)})` : ""}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-muted text-sm">No audit events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
