"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const TYPE_LABEL: Record<string, string> = {
  CUSTOMER_STATUS_CHANGE: "Customer status change",
  CUSTOMER_PROFILE_UPDATE: "Customer profile update",
  ACCOUNT_HOLDER_ADD: "Account holder addition",
  PRODUCT_ACTIVATION: "Product activation",
  AML_ADJUDICATION: "AML/watchlist adjudication",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  APPROVED: "bg-green-100 text-green-600",
  REJECTED: "bg-rose-100 text-rose-600",
};

export default function ApprovalsPage() {
  const toast = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  function load() {
    api.listApprovals(showResolved ? undefined : "PENDING").then((res) => setRequests(res.requests)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [showResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove(id: string) {
    setBusyId(id); setError(null);
    try {
      await api.approveRequest(id);
      toast.success("Approved.");
      load();
    } catch (err: any) { setError(err.message || "Could not approve"); }
    finally { setBusyId(null); }
  }

  async function handleReject(id: string) {
    setBusyId(id); setError(null);
    try {
      await api.rejectRequest(id);
      toast.success("Rejected.");
      load();
    } catch (err: any) { setError(err.message || "Could not reject"); }
    finally { setBusyId(null); }
  }

  return (
    <AppShell active="Approvals">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Approvals</h1>
            <p className="text-text-muted text-sm mt-1">Shared approval workflow (doc §24/§36/§47/§62/§34). Whoever submitted a request cannot approve it themselves.</p>
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] text-text-500">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm table-modern">
            <thead><tr><th>Type</th><th>Reason</th><th>Requested</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="text-text-900 font-medium">{TYPE_LABEL[r.type] || r.type}</td>
                  <td className="text-text-700">{r.reason || "—"}</td>
                  <td className="text-text-700 whitespace-nowrap">{new Date(r.requestedAt).toLocaleString()}</td>
                  <td><span className={`badge ${STATUS_COLOR[r.status] || ""}`}>{r.status}</span></td>
                  <td className="whitespace-nowrap space-x-2">
                    {r.status === "PENDING" && (
                      <>
                        <button onClick={() => handleApprove(r.id)} disabled={busyId === r.id} className="btn-text text-green-600">Approve</button>
                        <button onClick={() => handleReject(r.id)} disabled={busyId === r.id} className="btn-text text-rose-600">Reject</button>
                      </>
                    )}
                    {r.status !== "PENDING" && r.resolutionNote && <span className="text-text-muted text-xs">{r.resolutionNote}</span>}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">{showResolved ? "No approval requests yet." : "No pending approvals."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
