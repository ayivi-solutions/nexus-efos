"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const CASE_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-gold-500/15 text-gold-600",
  INVESTIGATING: "bg-blue-100 text-blue-600",
  RESOLVED: "bg-green-100 text-green-600",
  CLOSED: "bg-text-muted/15 text-text-muted",
};

const RATING_BADGE: Record<string, string> = {
  UNSATISFACTORY: "bg-rose-100 text-rose-600",
  NEEDS_IMPROVEMENT: "bg-orange-100 text-orange-600",
  MEETS_EXPECTATIONS: "bg-gold-500/15 text-gold-600",
  EXCEEDS_EXPECTATIONS: "bg-green-100 text-green-600",
  OUTSTANDING: "bg-green-100 text-green-600",
};

export default function HRPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"attendance" | "performance" | "disciplinary">("attendance");

  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [clockInEmployeeId, setClockInEmployeeId] = useState("");
  const [reviewForm, setReviewForm] = useState({ employeeId: "", reviewerId: "", cycleLabel: "", goals: "" });
  const [caseForm, setCaseForm] = useState({ employeeId: "", misconductDescription: "" });

  function load() {
    api.listEmployees().then((r) => setEmployees(r.employees)).catch(() => {});
    api.listAttendance().then((r) => setAttendance(r.records)).catch((e) => setError(e.message));
    api.listPerformanceReviews().then((r) => setReviews(r.reviews)).catch((e) => setError(e.message));
    api.listDisciplinaryCases().then((r) => setCases(r.cases)).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const employeeName = (id: string) => employees.find((e: any) => e.id === id)?.fullName || id;

  async function handleClockIn(e: React.FormEvent) {
    e.preventDefault();
    if (!clockInEmployeeId) return;
    setBusy("clockin"); setError(null);
    try { await api.clockIn(clockInEmployeeId); toast.success("Clocked in."); setClockInEmployeeId(""); load(); }
    catch (err: any) { setError(err.message || "Could not clock in"); } finally { setBusy(null); }
  }

  async function handleClockOut(id: string) {
    setBusy(id); setError(null);
    try { await api.clockOut(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleRequestCorrection(id: string) {
    const clockIn = window.prompt("Corrected clock-in time (YYYY-MM-DDTHH:MM, leave blank to keep unchanged):");
    const clockOut = window.prompt("Corrected clock-out time (YYYY-MM-DDTHH:MM, leave blank to keep unchanged):");
    const reason = window.prompt("Reason for this correction:");
    if (!reason) return;
    setBusy(id); setError(null);
    try {
      await api.requestAttendanceCorrection(id, { proposedClockInAt: clockIn || undefined, proposedClockOutAt: clockOut || undefined, reason });
      toast.info("Correction submitted for approval.");
      load();
    } catch (err: any) { setError(err.message || "Could not submit correction"); } finally { setBusy(null); }
  }

  async function handleCreateReview(e: React.FormEvent) {
    e.preventDefault();
    setBusy("review"); setError(null);
    try {
      await api.createPerformanceReview(reviewForm);
      toast.success("Review created.");
      setReviewForm({ employeeId: "", reviewerId: "", cycleLabel: "", goals: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not create review"); } finally { setBusy(null); }
  }

  async function handleManagerAssessment(id: string) {
    const managerAssessment = window.prompt("Manager assessment:");
    if (!managerAssessment) return;
    const rating = window.prompt("Rating (UNSATISFACTORY / NEEDS_IMPROVEMENT / MEETS_EXPECTATIONS / EXCEEDS_EXPECTATIONS / OUTSTANDING):");
    if (!rating) return;
    setBusy(id); setError(null);
    try { await api.submitManagerAssessment(id, { managerAssessment, rating }); load(); }
    catch (err: any) { setError(err.message || "Could not submit assessment"); } finally { setBusy(null); }
  }

  async function handleRaiseCase(e: React.FormEvent) {
    e.preventDefault();
    setBusy("case"); setError(null);
    try {
      await api.raiseDisciplinaryCase(caseForm);
      toast.success("Case raised.");
      setCaseForm({ employeeId: "", misconductDescription: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not raise case"); } finally { setBusy(null); }
  }

  async function handleInvestigateCase(id: string) {
    setBusy(id); setError(null);
    try { await api.investigateDisciplinaryCase(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  async function handleResolveCase(id: string) {
    const actionTaken = window.prompt("Action taken (VERBAL_WARNING / WRITTEN_WARNING / FINAL_WARNING / SUSPENSION / TERMINATION):");
    if (!actionTaken) return;
    setBusy(id); setError(null);
    try { await api.resolveDisciplinaryCase(id, actionTaken); load(); }
    catch (err: any) { setError(err.message || "Could not resolve case"); } finally { setBusy(null); }
  }

  async function handleCloseCase(id: string) {
    setBusy(id); setError(null);
    try { await api.closeDisciplinaryCase(id); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  return (
    <AppShell active="HR: Attendance & Discipline">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">HR: Attendance, Performance & Discipline</h1>
        <p className="text-text-muted text-sm mb-6">EFS §201 Attendance Management + §203 Performance Management; ETAS §41.4 Disciplinary Records. Shift Management and Biometric Integration (named in §201.2) aren&apos;t built — no roster/shift concept exists, and no biometric hardware integration exists.</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("attendance")} className={`btn-text ${tab === "attendance" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Attendance</button>
          <button onClick={() => setTab("performance")} className={`btn-text ${tab === "performance" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Performance</button>
          <button onClick={() => setTab("disciplinary")} className={`btn-text ${tab === "disciplinary" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Disciplinary</button>
        </div>

        {tab === "attendance" && (
          <>
            <form onSubmit={handleClockIn} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input flex-1 min-w-[200px]" value={clockInEmployeeId} onChange={(e) => setClockInEmployeeId(e.target.value)}>
                <option value="">Employee to clock in…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <button type="submit" disabled={busy === "clockin"} className="btn-primary">Clock in</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm table-modern">
                <thead><tr><th>Employee</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Method</th><th></th></tr></thead>
                <tbody>
                  {attendance.map((a: any) => (
                    <tr key={a.id}>
                      <td className="text-text-900 font-medium">{employeeName(a.employeeId)}</td>
                      <td className="text-text-700">{new Date(a.workDate).toLocaleDateString()}</td>
                      <td className="text-text-700">{new Date(a.clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="text-text-700">{a.clockOutAt ? new Date(a.clockOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="text-text-muted text-[12px]">{a.method}{a.correctionPending && <span className="ml-1 text-gold-600 font-semibold">CORRECTION PENDING</span>}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          {!a.clockOutAt && <button disabled={busy === a.id} onClick={() => handleClockOut(a.id)} className="btn-text text-gold-600">Clock out</button>}
                          {!a.correctionPending && <button disabled={busy === a.id} onClick={() => handleRequestCorrection(a.id)} className="btn-text text-blue-600">Request correction</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {attendance.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No attendance records.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "performance" && (
          <>
            <form onSubmit={handleCreateReview} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input flex-1 min-w-[160px]" value={reviewForm.employeeId} onChange={(e) => setReviewForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Employee…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <select required className="input flex-1 min-w-[160px]" value={reviewForm.reviewerId} onChange={(e) => setReviewForm((f) => ({ ...f, reviewerId: e.target.value }))}>
                <option value="">Reviewer…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <input required placeholder="Cycle (e.g. 2026 H1)" className="input !w-40" value={reviewForm.cycleLabel} onChange={(e) => setReviewForm((f) => ({ ...f, cycleLabel: e.target.value }))} />
              <input placeholder="Goals" className="input flex-1 min-w-[180px]" value={reviewForm.goals} onChange={(e) => setReviewForm((f) => ({ ...f, goals: e.target.value }))} />
              <button type="submit" disabled={busy === "review"} className="btn-primary">Start review</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm table-modern">
                <thead><tr><th>Employee</th><th>Cycle</th><th>Reviewer</th><th>Rating</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {reviews.map((r: any) => (
                    <tr key={r.id}>
                      <td className="text-text-900 font-medium">{employeeName(r.employeeId)}</td>
                      <td className="text-text-700">{r.cycleLabel}</td>
                      <td className="text-text-700">{employeeName(r.reviewerId)}</td>
                      <td>{r.rating ? <span className={`badge ${RATING_BADGE[r.rating]}`}>{r.rating.replaceAll("_", " ")}</span> : "—"}</td>
                      <td className="text-text-muted text-[12px]">{r.status.replaceAll("_", " ")}</td>
                      <td>{r.status !== "COMPLETED" && <button disabled={busy === r.id} onClick={() => handleManagerAssessment(r.id)} className="btn-text text-gold-600">Complete assessment</button>}</td>
                    </tr>
                  ))}
                  {reviews.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No performance reviews.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "disciplinary" && (
          <>
            <form onSubmit={handleRaiseCase} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input flex-1 min-w-[160px]" value={caseForm.employeeId} onChange={(e) => setCaseForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Employee…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <input required placeholder="Misconduct description" className="input flex-1 min-w-[220px]" value={caseForm.misconductDescription} onChange={(e) => setCaseForm((f) => ({ ...f, misconductDescription: e.target.value }))} />
              <button type="submit" disabled={busy === "case"} className="btn-primary">Raise case</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm table-modern">
                <thead><tr><th>Employee</th><th>Description</th><th>Action</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {cases.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-900 font-medium">{employeeName(c.employeeId)}</td>
                      <td className="text-text-700 text-[12.5px] max-w-[280px] truncate">{c.misconductDescription}</td>
                      <td className="text-text-700 text-[12px]">{c.actionTaken?.replaceAll("_", " ") || "—"}</td>
                      <td><span className={`badge ${CASE_STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-2">
                          {c.status === "OPEN" && <button disabled={busy === c.id} onClick={() => handleInvestigateCase(c.id)} className="btn-text text-blue-600">Investigate</button>}
                          {(c.status === "OPEN" || c.status === "INVESTIGATING") && <button disabled={busy === c.id} onClick={() => handleResolveCase(c.id)} className="btn-text text-rose-600">Resolve</button>}
                          {c.status === "RESOLVED" && <button disabled={busy === c.id} onClick={() => handleCloseCase(c.id)} className="btn-text text-text-muted">Close</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cases.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No disciplinary cases.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
