"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const COMPLAINT_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-gold-500/15 text-gold-600",
  INVESTIGATING: "bg-blue-100 text-blue-600",
  RESOLVED: "bg-green-100 text-green-600",
  CLOSED: "bg-text-muted/15 text-text-muted",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-text-muted/15 text-text-muted",
  MEDIUM: "bg-gold-500/15 text-gold-600",
  HIGH: "bg-orange-100 text-orange-600",
  CRITICAL: "bg-rose-100 text-rose-600",
};

export default function CustomerCarePage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"followups" | "complaints">("followups");

  const [customers, setCustomers] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [showAllInteractions, setShowAllInteractions] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [interactionForm, setInteractionForm] = useState({ customerId: "", channel: "CALL", summary: "", followUpScheduledAt: "" });
  const [complaintForm, setComplaintForm] = useState({ customerId: "", category: "SERVICE_QUALITY", priority: "MEDIUM", description: "" });

  function load() {
    api.listCustomers().then((r) => setCustomers(r.customers)).catch(() => {});
    api.listInteractions(showAllInteractions ? undefined : { dueForFollowUp: true }).then((r) => setInteractions(r.interactions)).catch((e) => setError(e.message));
    api.listComplaints(statusFilter ? { status: statusFilter } : undefined).then((r) => setComplaints(r.complaints)).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [showAllInteractions, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.fullName || id;

  async function handleRecordInteraction(e: React.FormEvent) {
    e.preventDefault();
    setBusy("interaction"); setError(null);
    try {
      await api.recordInteraction({ ...interactionForm, followUpScheduledAt: interactionForm.followUpScheduledAt || undefined });
      toast.success("Interaction recorded.");
      setInteractionForm({ customerId: "", channel: "CALL", summary: "", followUpScheduledAt: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not record interaction"); } finally { setBusy(null); }
  }

  async function handleCompleteFollowUp(id: string) {
    const notes = window.prompt("Notes on this follow-up (optional):") || undefined;
    setBusy(id); setError(null);
    try { await api.completeFollowUp(id, notes); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleRegisterComplaint(e: React.FormEvent) {
    e.preventDefault();
    setBusy("complaint"); setError(null);
    try {
      const r = await api.registerComplaint(complaintForm);
      toast.success(`Complaint ${r.complaint.referenceNumber} registered.`);
      setComplaintForm({ customerId: "", category: "SERVICE_QUALITY", priority: "MEDIUM", description: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not register complaint"); } finally { setBusy(null); }
  }

  async function handleInvestigate(id: string) {
    setBusy(id); setError(null);
    try { await api.investigateComplaint(id, {}); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleResolve(id: string) {
    const resolutionNotes = window.prompt("How was this resolved?");
    if (!resolutionNotes) return;
    const customerNotified = window.confirm("Has the customer been notified of the resolution?");
    setBusy(id); setError(null);
    try { await api.resolveComplaint(id, { resolutionNotes, customerNotified }); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleClose(id: string) {
    setBusy(id); setError(null);
    try { await api.closeComplaint(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  return (
    <AppShell active="Customer Care">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Customer Care</h1>
        <p className="text-text-muted text-sm mb-6">EFS §157 Customer Interaction Management + §160 Customer Complaint Management. SLA targets and escalation use disclosed defaults (24h Critical / 48h High / 5 days Medium / 10 days Low) — no configuration screen exists yet to change these per institution.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("followups")} className={`btn-text ${tab === "followups" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Interactions & Follow-ups</button>
          <button onClick={() => setTab("complaints")} className={`btn-text ${tab === "complaints" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Complaints</button>
        </div>

        {tab === "followups" && (
          <>
            <form onSubmit={handleRecordInteraction} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input flex-1 min-w-[160px]" value={interactionForm.customerId} onChange={(e) => setInteractionForm((f) => ({ ...f, customerId: e.target.value }))}>
                <option value="">Customer…</option>
                {customers.map((c: any) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
              </select>
              <select className="input !w-36" value={interactionForm.channel} onChange={(e) => setInteractionForm((f) => ({ ...f, channel: e.target.value }))}>
                {["CALL", "BRANCH_VISIT", "EMAIL", "SMS", "LIVE_CHAT", "SOCIAL_MEDIA", "MEETING"].map((c) => (<option key={c} value={c}>{c.replaceAll("_", " ")}</option>))}
              </select>
              <input required placeholder="Summary" className="input flex-1 min-w-[180px]" value={interactionForm.summary} onChange={(e) => setInteractionForm((f) => ({ ...f, summary: e.target.value }))} />
              <input type="date" className="input" title="Follow-up date (optional)" value={interactionForm.followUpScheduledAt} onChange={(e) => setInteractionForm((f) => ({ ...f, followUpScheduledAt: e.target.value }))} />
              <button type="submit" disabled={busy === "interaction"} className="btn-primary">Record</button>
            </form>

            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setShowAllInteractions(false)} className={`btn-text ${!showAllInteractions ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Due for follow-up</button>
              <button onClick={() => setShowAllInteractions(true)} className={`btn-text ${showAllInteractions ? "text-gold-600 font-semibold" : "text-text-muted"}`}>All interactions</button>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm table-modern">
                <thead><tr><th>Customer</th><th>Channel</th><th>Summary</th><th>Follow-up</th><th></th></tr></thead>
                <tbody>
                  {interactions.map((i: any) => (
                    <tr key={i.id}>
                      <td className="text-text-900 font-medium">{customerName(i.customerId)}</td>
                      <td className="text-text-700">{i.channel.replaceAll("_", " ")}</td>
                      <td className="text-text-700 text-[12.5px] max-w-[260px] truncate">{i.summary}</td>
                      <td className="text-text-700 text-[12px]">
                        {i.followUpScheduledAt ? (
                          i.followUpCompleted ? <span className="text-green-600">Done {new Date(i.followUpCompletedAt).toLocaleDateString()}</span> : new Date(i.followUpScheduledAt).toLocaleDateString()
                        ) : "—"}
                      </td>
                      <td>{i.followUpScheduledAt && !i.followUpCompleted && (<button disabled={busy === i.id} onClick={() => handleCompleteFollowUp(i.id)} className="btn-text text-gold-600">Mark done</button>)}</td>
                    </tr>
                  ))}
                  {interactions.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">{showAllInteractions ? "No interactions recorded." : "Nothing due for follow-up."}</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "complaints" && (
          <>
            <form onSubmit={handleRegisterComplaint} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input flex-1 min-w-[160px]" value={complaintForm.customerId} onChange={(e) => setComplaintForm((f) => ({ ...f, customerId: e.target.value }))}>
                <option value="">Customer…</option>
                {customers.map((c: any) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
              </select>
              <select className="input !w-40" value={complaintForm.category} onChange={(e) => setComplaintForm((f) => ({ ...f, category: e.target.value }))}>
                {["SERVICE_QUALITY", "LOAN_TERMS", "FEES_CHARGES", "STAFF_CONDUCT", "TRANSACTION_ERROR", "FRAUD_SECURITY", "OTHER"].map((c) => (<option key={c} value={c}>{c.replaceAll("_", " ")}</option>))}
              </select>
              <select className="input !w-28" value={complaintForm.priority} onChange={(e) => setComplaintForm((f) => ({ ...f, priority: e.target.value }))}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
              <input required placeholder="Description" className="input flex-1 min-w-[200px]" value={complaintForm.description} onChange={(e) => setComplaintForm((f) => ({ ...f, description: e.target.value }))} />
              <button type="submit" disabled={busy === "complaint"} className="btn-primary">Register</button>
            </form>

            <select className="input !w-40 mb-3" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"].map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm table-modern">
                <thead><tr><th>Ref</th><th>Customer</th><th>Category</th><th>Priority</th><th>SLA</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {complaints.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-900 font-mono text-[12px]">{c.referenceNumber}</td>
                      <td className="text-text-700">{customerName(c.customerId)}</td>
                      <td className="text-text-700">{c.category.replaceAll("_", " ")}</td>
                      <td><span className={`badge ${PRIORITY_BADGE[c.priority]}`}>{c.priority}</span></td>
                      <td className="text-[12px]">
                        {c.escalated ? <span className="text-rose-600 font-semibold">ESCALATED</span> : <span className="text-text-muted">{new Date(c.slaTargetAt).toLocaleDateString()}</span>}
                      </td>
                      <td><span className={`badge ${COMPLAINT_STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          {c.status === "OPEN" && <button disabled={busy === c.id} onClick={() => handleInvestigate(c.id)} className="btn-text text-blue-600">Investigate</button>}
                          {(c.status === "OPEN" || c.status === "INVESTIGATING") && <button disabled={busy === c.id} onClick={() => handleResolve(c.id)} className="btn-text text-green-600">Resolve</button>}
                          {c.status === "RESOLVED" && <button disabled={busy === c.id} onClick={() => handleClose(c.id)} className="btn-text text-text-muted">Close</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {complaints.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No complaints.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
