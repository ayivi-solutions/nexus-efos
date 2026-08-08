"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const ENGAGEMENT_STATUS_BADGE: Record<string, string> = {
  PLANNED: "bg-text-muted/15 text-text-muted",
  APPROVED: "bg-blue-100 text-blue-600",
  IN_PROGRESS: "bg-gold-500/15 text-gold-600",
  UNDER_REVIEW: "bg-blue-100 text-blue-600",
  COMPLETED: "bg-green-100 text-green-600",
  FOLLOW_UP: "bg-orange-100 text-orange-600",
  CLOSED: "bg-text-muted/15 text-text-muted",
  ARCHIVED: "bg-text-muted/15 text-text-muted",
};

const FINDING_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-gold-500/15 text-gold-600",
  IN_PROGRESS: "bg-blue-100 text-blue-600",
  IMPLEMENTED: "bg-orange-100 text-orange-600",
  VERIFIED: "bg-green-100 text-green-600",
  CLOSED: "bg-text-muted/15 text-text-muted",
};

const RISK_BADGE: Record<string, string> = {
  LOW: "bg-text-muted/15 text-text-muted",
  MEDIUM: "bg-gold-500/15 text-gold-600",
  HIGH: "bg-orange-100 text-orange-600",
  CRITICAL: "bg-rose-100 text-rose-600",
};

export default function InternalAuditPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"engagements" | "findings">("engagements");

  const [engagements, setEngagements] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [engagementForm, setEngagementForm] = useState({ type: "INTERNAL", branchId: "", leadAuditor: "", scope: "", plannedStartDate: "" });
  const [findingForm, setFindingForm] = useState({ engagementId: "", description: "", riskClassification: "MEDIUM", recommendation: "", actionOwnerId: "", targetRemediationDate: "" });

  function load() {
    api.listEmployees().then((r) => setEmployees(r.employees)).catch(() => {});
    api.listBranches().then((r) => setBranches(r.branches)).catch(() => {});
    api.listAuditEngagements().then((r) => setEngagements(r.engagements)).catch((e) => setError(e.message));
    api.listAuditFindings().then((r) => setFindings(r.findings)).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const engagementLabel = (id: string) => engagements.find((e: any) => e.id === id)?.auditNumber || id;
  const employeeName = (id?: string | null) => (id && employees.find((e: any) => e.id === id)?.fullName) || "Unassigned";

  async function handleCreateEngagement(e: React.FormEvent) {
    e.preventDefault();
    setBusy("engagement"); setError(null);
    try {
      const r = await api.createAuditEngagement({ ...engagementForm, branchId: engagementForm.branchId || undefined });
      toast.success(`Audit ${r.engagement.auditNumber} created.`);
      setEngagementForm({ type: "INTERNAL", branchId: "", leadAuditor: "", scope: "", plannedStartDate: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not create engagement"); } finally { setBusy(null); }
  }

  async function handleRequestApproval(id: string) {
    setBusy(id); setError(null);
    try { await api.requestAuditEngagementApproval(id); toast.info("Scope submitted for approval."); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleSetStatus(id: string, status: string) {
    setBusy(id); setError(null);
    try { await api.setAuditEngagementStatus(id, status); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleRate(id: string) {
    const rating = window.prompt("Rating (SATISFACTORY / NEEDS_IMPROVEMENT / UNSATISFACTORY):");
    if (!rating) return;
    setBusy(id); setError(null);
    try { await api.rateAuditEngagement(id, rating); load(); }
    catch (err: any) { setError(err.message || "Could not set rating"); } finally { setBusy(null); }
  }

  async function handleCloseEngagement(id: string) {
    setBusy(id); setError(null);
    try { await api.closeAuditEngagement(id); toast.success("Engagement closed."); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleRegisterFinding(e: React.FormEvent) {
    e.preventDefault();
    setBusy("finding"); setError(null);
    try {
      const r = await api.registerAuditFinding({ ...findingForm, actionOwnerId: findingForm.actionOwnerId || undefined, targetRemediationDate: findingForm.targetRemediationDate || undefined });
      toast.success(`Finding ${r.finding.referenceNumber} registered.`);
      setFindingForm({ engagementId: "", description: "", riskClassification: "MEDIUM", recommendation: "", actionOwnerId: "", targetRemediationDate: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not register finding"); } finally { setBusy(null); }
  }

  async function handleRespond(id: string) {
    const managementResponse = window.prompt("Management response:");
    if (!managementResponse) return;
    setBusy(id); setError(null);
    try { await api.respondToAuditFinding(id, { managementResponse }); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleMarkImplemented(id: string) {
    setBusy(id); setError(null);
    try { await api.markAuditFindingImplemented(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleVerify(id: string) {
    setBusy(id); setError(null);
    try { await api.verifyAuditFinding(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleCloseFinding(id: string) {
    setBusy(id); setError(null);
    try { await api.closeAuditFinding(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  return (
    <AppShell active="Internal Audit">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Internal Audit</h1>
        <p className="text-text-muted text-sm mb-6">EFS §298 Audit Findings and Recommendation Management + §299.2 Overdue Action Monitoring; ETAS §78 Audit Entity Architecture. Scoped to findings and remediation tracking — the full §297 audit planning module (audit universe, annual risk-based planning, team assignment) isn&apos;t built.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("engagements")} className={`btn-text ${tab === "engagements" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Engagements</button>
          <button onClick={() => setTab("findings")} className={`btn-text ${tab === "findings" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Findings</button>
        </div>

        {tab === "engagements" && (
          <>
            <form onSubmit={handleCreateEngagement} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select className="input !w-32" value={engagementForm.type} onChange={(e) => setEngagementForm((f) => ({ ...f, type: e.target.value }))}>
                {["INTERNAL", "EXTERNAL", "REGULATORY", "IT", "FINANCIAL"].map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
              <select className="input !w-40" value={engagementForm.branchId} onChange={(e) => setEngagementForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">All branches</option>
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
              <input required placeholder="Lead auditor" className="input !w-40" value={engagementForm.leadAuditor} onChange={(e) => setEngagementForm((f) => ({ ...f, leadAuditor: e.target.value }))} />
              <input required placeholder="Scope" className="input flex-1 min-w-[200px]" value={engagementForm.scope} onChange={(e) => setEngagementForm((f) => ({ ...f, scope: e.target.value }))} />
              <input required type="date" className="input" value={engagementForm.plannedStartDate} onChange={(e) => setEngagementForm((f) => ({ ...f, plannedStartDate: e.target.value }))} />
              <button type="submit" disabled={busy === "engagement"} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm table-modern">
                <thead><tr><th>Audit #</th><th>Type</th><th>Lead</th><th>Scope</th><th>Rating</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {engagements.map((e: any) => (
                    <tr key={e.id}>
                      <td className="text-text-900 font-mono text-[12px]">{e.auditNumber}</td>
                      <td className="text-text-700">{e.type}</td>
                      <td className="text-text-700">{e.leadAuditor}</td>
                      <td className="text-text-700 text-[12.5px] max-w-[220px] truncate">{e.scope}</td>
                      <td className="text-text-700 text-[12px]">{e.rating?.replaceAll("_", " ") || "—"}</td>
                      <td><span className={`badge ${ENGAGEMENT_STATUS_BADGE[e.status]}`}>{e.status.replaceAll("_", " ")}</span></td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          {e.status === "PLANNED" && <button disabled={busy === e.id} onClick={() => handleRequestApproval(e.id)} className="btn-text text-blue-600">Request approval</button>}
                          {e.status === "IN_PROGRESS" && <button disabled={busy === e.id} onClick={() => handleSetStatus(e.id, "UNDER_REVIEW")} className="btn-text text-blue-600">Under review</button>}
                          {e.status === "UNDER_REVIEW" && <button disabled={busy === e.id} onClick={() => handleSetStatus(e.id, "COMPLETED")} className="btn-text text-green-600">Complete</button>}
                          {(e.status === "COMPLETED" || e.status === "FOLLOW_UP") && !e.rating && <button disabled={busy === e.id} onClick={() => handleRate(e.id)} className="btn-text text-gold-600">Rate</button>}
                          {(e.status === "COMPLETED" || e.status === "FOLLOW_UP") && <button disabled={busy === e.id} onClick={() => handleCloseEngagement(e.id)} className="btn-text text-rose-600">Close</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {engagements.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No audit engagements.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "findings" && (
          <>
            <form onSubmit={handleRegisterFinding} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input flex-1 min-w-[160px]" value={findingForm.engagementId} onChange={(e) => setFindingForm((f) => ({ ...f, engagementId: e.target.value }))}>
                <option value="">Engagement…</option>
                {engagements.map((e: any) => (<option key={e.id} value={e.id}>{e.auditNumber}</option>))}
              </select>
              <select className="input !w-28" value={findingForm.riskClassification} onChange={(e) => setFindingForm((f) => ({ ...f, riskClassification: e.target.value }))}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
              <input required placeholder="Description" className="input flex-1 min-w-[180px]" value={findingForm.description} onChange={(e) => setFindingForm((f) => ({ ...f, description: e.target.value }))} />
              <input required placeholder="Recommendation" className="input flex-1 min-w-[180px]" value={findingForm.recommendation} onChange={(e) => setFindingForm((f) => ({ ...f, recommendation: e.target.value }))} />
              <select className="input !w-36" value={findingForm.actionOwnerId} onChange={(e) => setFindingForm((f) => ({ ...f, actionOwnerId: e.target.value }))}>
                <option value="">Owner (optional)…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <input type="date" className="input" title="Target remediation date" value={findingForm.targetRemediationDate} onChange={(e) => setFindingForm((f) => ({ ...f, targetRemediationDate: e.target.value }))} />
              <button type="submit" disabled={busy === "finding"} className="btn-primary">Register</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm table-modern">
                <thead><tr><th>Ref</th><th>Engagement</th><th>Risk</th><th>Description</th><th>Owner</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {findings.map((f: any) => (
                    <tr key={f.id}>
                      <td className="text-text-900 font-mono text-[12px]">{f.referenceNumber}</td>
                      <td className="text-text-700 text-[12px]">{engagementLabel(f.engagementId)}</td>
                      <td><span className={`badge ${RISK_BADGE[f.riskClassification]}`}>{f.riskClassification}</span></td>
                      <td className="text-text-700 text-[12.5px] max-w-[220px] truncate">{f.description}</td>
                      <td className="text-text-700 text-[12px]">{employeeName(f.actionOwnerId)}</td>
                      <td>
                        <span className={`badge ${FINDING_STATUS_BADGE[f.status]}`}>{f.status}</span>
                        {f.overdue && <span className="ml-1 text-rose-600 text-[10px] font-semibold">OVERDUE</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          {f.status === "OPEN" && <button disabled={busy === f.id} onClick={() => handleRespond(f.id)} className="btn-text text-blue-600">Respond</button>}
                          {(f.status === "OPEN" || f.status === "IN_PROGRESS") && <button disabled={busy === f.id} onClick={() => handleMarkImplemented(f.id)} className="btn-text text-gold-600">Mark implemented</button>}
                          {f.status === "IMPLEMENTED" && <button disabled={busy === f.id} onClick={() => handleVerify(f.id)} className="btn-text text-green-600">Verify</button>}
                          {f.status === "VERIFIED" && <button disabled={busy === f.id} onClick={() => handleCloseFinding(f.id)} className="btn-text text-text-muted">Close</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {findings.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No findings.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
