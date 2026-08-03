"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  APPROVED: "bg-gold-500/15 text-gold-600",
  REJECTED: "bg-rose-100 text-rose-600",
  DISBURSED: "bg-green-100 text-green-600",
  ACTIVE: "bg-green-100 text-green-600",
  CLOSED: "bg-paper-100 text-text-muted",
  DEFAULTED: "bg-rose-100 text-rose-600",
};

const ARREARS_COLOR: Record<string, string> = {
  CURRENT: "bg-green-100 text-green-600",
  ARREARS_1_30: "bg-gold-500/15 text-gold-600",
  ARREARS_31_60: "bg-rose-100 text-rose-600",
  ARREARS_61_90: "bg-rose-100 text-rose-600",
  ARREARS_90_PLUS: "bg-rose-100 text-rose-600",
};
const ARREARS_LABEL: Record<string, string> = {
  CURRENT: "Current",
  ARREARS_1_30: "1-30 days overdue",
  ARREARS_31_60: "31-60 days overdue",
  ARREARS_61_90: "61-90 days overdue",
  ARREARS_90_PLUS: "90+ days overdue",
};

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [loan, setLoan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [holderForm, setHolderForm] = useState({ customerId: "", role: "JOINT" });
  const [promises, setPromises] = useState<any[]>([]);
  const [promiseForm, setPromiseForm] = useState({ promisedAmount: "", promisedDate: "", notes: "" });
  const [penalties, setPenalties] = useState<any[]>([]);
  const [penaltyForm, setPenaltyForm] = useState({ calculationMethod: "PERCENTAGE", rateOrAmount: "" });
  const [assessment, setAssessment] = useState<any>(null);
  const [assessmentForm, setAssessmentForm] = useState({ monthlyIncome: "", monthlyExpenses: "", creditBureauChecked: false, creditBureauNotes: "" });
  const [guarantors, setGuarantors] = useState<any[]>([]);
  const [guarantorForm, setGuarantorForm] = useState({ fullName: "", phone: "", relationship: "", guaranteeLimit: "" });
  const [collateralList, setCollateralList] = useState<any[]>([]);
  const [collateralForm, setCollateralForm] = useState({ type: "LAND", description: "", ownerName: "", estimatedValue: "", valuationDate: "" });
  const [restructures, setRestructures] = useState<any[]>([]);
  const [restructureForm, setRestructureForm] = useState({ newPrincipal: "", newRate: "", newTermMonths: "", reason: "" });
  const [reschedules, setReschedules] = useState<any[]>([]);
  const [rescheduleForm, setRescheduleForm] = useState({ shiftDays: "", reason: "" });
  const [writeOffs, setWriteOffs] = useState<any[]>([]);
  const [writeOffForm, setWriteOffForm] = useState({ amount: "", reason: "" });

  function load() {
    api.getLoan(id).then((res) => setLoan(res.loan)).catch((err) => setError(err.message));
    api.listPromisesToPay(id).then((res) => setPromises(res.promises)).catch(() => {});
    api.listLoanPenalties(id).then((res) => setPenalties(res.penalties)).catch(() => {});
    api.getCreditAssessment(id).then((res) => setAssessment(res.assessment)).catch(() => {});
    api.listGuarantors(id).then((res) => setGuarantors(res.guarantors)).catch(() => {});
    api.listCollateral(id).then((res) => setCollateralList(res.collateral)).catch(() => {});
    api.listRestructures(id).then((res) => setRestructures(res.restructures)).catch(() => {});
    api.listReschedules(id).then((res) => setReschedules(res.reschedules)).catch(() => {});
    api.listWriteOffs(id).then((res) => setWriteOffs(res.writeOffs)).catch(() => {});
  }

  useEffect(() => {
    load();
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRecordPromise(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.recordPromiseToPay(id, { promisedAmount: Number(promiseForm.promisedAmount), promisedDate: promiseForm.promisedDate, notes: promiseForm.notes || undefined });
      setPromiseForm({ promisedAmount: "", promisedDate: "", notes: "" });
      toast.success("Promise to pay recorded.");
      load();
    } catch (err: any) { setError(err.message || "Could not record promise"); }
    finally { setBusy(false); }
  }

  async function handlePromiseStatus(promiseId: string, status: "KEPT" | "BROKEN") {
    setBusy(true); setError(null);
    try { await api.updatePromiseToPayStatus(promiseId, status); load(); }
    catch (err: any) { setError(err.message || "Could not update promise"); }
    finally { setBusy(false); }
  }

  async function handleApplyPenalty(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.applyLoanPenalty(id, { calculationMethod: penaltyForm.calculationMethod as "FIXED" | "PERCENTAGE", rateOrAmount: Number(penaltyForm.rateOrAmount) });
      setPenaltyForm({ calculationMethod: "PERCENTAGE", rateOrAmount: "" });
      toast.success("Penalty applied.");
      load();
    } catch (err: any) { setError(err.message || "Could not apply penalty"); }
    finally { setBusy(false); }
  }

  async function handleWaivePenalty(penaltyId: string) {
    const reason = window.prompt("Reason for waiving this penalty:");
    if (reason === null) return;
    setBusy(true); setError(null);
    try { await api.waiveLoanPenalty(penaltyId, reason); load(); }
    catch (err: any) { setError(err.message || "Could not waive penalty"); }
    finally { setBusy(false); }
  }

  async function handleRunAssessment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createCreditAssessment(id, {
        monthlyIncome: Number(assessmentForm.monthlyIncome),
        monthlyExpenses: Number(assessmentForm.monthlyExpenses),
        creditBureauChecked: assessmentForm.creditBureauChecked,
        creditBureauNotes: assessmentForm.creditBureauNotes || undefined,
      });
      toast.success("Credit assessment recorded.");
      load();
    } catch (err: any) { setError(err.message || "Could not run assessment"); }
    finally { setBusy(false); }
  }

  async function handleOverrideAssessment() {
    const reason = window.prompt("Reason for overriding this assessment's recommendation:");
    if (!reason) return;
    setBusy(true); setError(null);
    try { await api.overrideCreditAssessment(id, reason); load(); }
    catch (err: any) { setError(err.message || "Could not override assessment"); }
    finally { setBusy(false); }
  }

  async function handleAddGuarantor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addGuarantor(id, { ...guarantorForm, guaranteeLimit: Number(guarantorForm.guaranteeLimit) });
      setGuarantorForm({ fullName: "", phone: "", relationship: "", guaranteeLimit: "" });
      toast.success("Guarantor registered.");
      load();
    } catch (err: any) { setError(err.message || "Could not add guarantor"); }
    finally { setBusy(false); }
  }

  async function handleApproveGuarantor(gid: string) {
    setBusy(true); setError(null);
    try { await api.approveGuarantor(gid); load(); }
    catch (err: any) { setError(err.message || "Could not approve guarantor"); }
    finally { setBusy(false); }
  }

  async function handleReleaseGuarantor(gid: string) {
    const reason = window.prompt("Reason for releasing this guarantor:");
    if (reason === null) return;
    setBusy(true); setError(null);
    try { await api.releaseGuarantor(gid, reason); load(); }
    catch (err: any) { setError(err.message || "Could not release guarantor"); }
    finally { setBusy(false); }
  }

  async function handleAddCollateral(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addCollateral(id, { ...collateralForm, estimatedValue: Number(collateralForm.estimatedValue) });
      setCollateralForm({ type: "LAND", description: "", ownerName: "", estimatedValue: "", valuationDate: "" });
      toast.success("Collateral registered.");
      load();
    } catch (err: any) { setError(err.message || "Could not add collateral"); }
    finally { setBusy(false); }
  }

  async function handleReleaseCollateral(cid: string) {
    const reason = window.prompt("Reason for releasing this collateral:");
    if (reason === null) return;
    setBusy(true); setError(null);
    try { await api.releaseCollateral(cid, reason); load(); }
    catch (err: any) { setError(err.message || "Could not release collateral"); }
    finally { setBusy(false); }
  }

  async function handleRequestRestructure(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.requestRestructure(id, { newPrincipal: Number(restructureForm.newPrincipal), newRate: Number(restructureForm.newRate), newTermMonths: Number(restructureForm.newTermMonths), reason: restructureForm.reason });
      setRestructureForm({ newPrincipal: "", newRate: "", newTermMonths: "", reason: "" });
      toast.info("Restructure submitted for approval.");
      load();
    } catch (err: any) { setError(err.message || "Could not request restructure"); }
    finally { setBusy(false); }
  }

  async function handleRequestReschedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.requestReschedule(id, { shiftDays: Number(rescheduleForm.shiftDays), reason: rescheduleForm.reason });
      setRescheduleForm({ shiftDays: "", reason: "" });
      toast.info("Reschedule submitted for approval.");
      load();
    } catch (err: any) { setError(err.message || "Could not request reschedule"); }
    finally { setBusy(false); }
  }

  async function handleRequestWriteOff(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.requestWriteOff(id, { amount: Number(writeOffForm.amount), reason: writeOffForm.reason });
      setWriteOffForm({ amount: "", reason: "" });
      toast.info("Write-off submitted for approval.");
      load();
    } catch (err: any) { setError(err.message || "Could not request write-off"); }
    finally { setBusy(false); }
  }

  async function handleRecordRecovery(writeOffId: string) {
    const amtStr = window.prompt("Amount recovered:");
    if (!amtStr) return;
    setBusy(true); setError(null);
    try { await api.recordWriteOffRecovery(writeOffId, Number(amtStr)); load(); }
    catch (err: any) { setError(err.message || "Could not record recovery"); }
    finally { setBusy(false); }
  }

  async function handleAddHolder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.addLoanHolder(id, holderForm);
      if (res?.pendingApproval) toast.info("Holder addition submitted for approval — a different authorised user must approve it.");
      setHolderForm({ customerId: "", role: "JOINT" });
      load();
    } catch (err: any) { setError(err.message || "Could not add account holder"); }
    finally { setBusy(false); }
  }

  async function handleRemoveHolder(holderId: string) {
    setBusy(true); setError(null);
    try { await api.removeLoanHolder(id, holderId); load(); }
    catch (err: any) { setError(err.message || "Could not remove holder"); }
    finally { setBusy(false); }
  }

  async function handleAction(action: "approve" | "reject" | "disburse") {
    setBusy(true);
    setError(null);
    try {
      if (action === "approve") await api.approveLoan(id);
      if (action === "reject") await api.rejectLoan(id);
      if (action === "disburse") await api.disburseLoan(id);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepayment() {
    const amount = Number(repayAmount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordRepayment(id, amount);
      setRepayAmount("");
      load();
    } catch (err: any) {
      setError(err.message || "Could not record repayment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell active="Loans">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <button onClick={() => router.push("/loans")} className="text-[13px] text-text-muted hover:text-text-700 mb-4">← Back to Loans</button>

        {!loan && !error && <p className="text-text-muted text-sm">Loading…</p>}

        {loan && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
              <div>
                <Link href={`/customers/${loan.customer.id}`} className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 hover:text-gold-600 selectable">
                  {loan.customer.fullName}
                </Link>
                <div className="text-text-muted text-sm mt-1 selectable">{loan.customer.phone} · {loan.branch?.name || "Unassigned branch"}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${STATUS_COLOR[loan.status] || ""}`}>{loan.status}</span>
                {["DISBURSED", "ACTIVE"].includes(loan.status) && (
                  <span className={`badge ${ARREARS_COLOR[loan.arrearsClassification] || ""}`}>{ARREARS_LABEL[loan.arrearsClassification] || loan.arrearsClassification}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-8">
              <Stat label="Principal" value={`GHS ${Number(loan.principal).toLocaleString()}`} />
              <Stat label="Interest rate" value={`${loan.interestRate}% p.a.`} />
              <Stat label="Term" value={`${loan.termMonths} months`} />
              <Stat label="Initiated" value={new Date(loan.createdAt).toLocaleDateString()} />
            </div>

            {["DISBURSED", "ACTIVE"].includes(loan.status) && loan.arrearsClassification !== "CURRENT" && (
              <div className="card p-4 mb-8 bg-rose-100/40 border-rose-600/30">
                <p className="text-rose-600 text-sm font-medium">{loan.daysInArrears} day(s) in arrears — GHS {Number(loan.arrearsAmount).toLocaleString()} overdue</p>
                <p className="text-text-muted text-xs mt-1">Recalculated automatically every day. Last checked: {loan.lastArrearsCheckAt ? new Date(loan.lastArrearsCheckAt).toLocaleString() : "not yet checked"}</p>
              </div>
            )}

            {/* doc §64 Credit Assessment — shown before Actions since it
                should inform, and typically precede, the approval decision. */}
            {loan.status === "PENDING" && !assessment && (
              <form onSubmit={handleRunAssessment} className="card p-6 mb-8">
                <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Credit Assessment</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Monthly income (GHS)</span>
                    <input required type="number" step="0.01" min="0" className="input" value={assessmentForm.monthlyIncome} onChange={(e) => setAssessmentForm((f) => ({ ...f, monthlyIncome: e.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Monthly expenses (GHS)</span>
                    <input required type="number" step="0.01" min="0" className="input" value={assessmentForm.monthlyExpenses} onChange={(e) => setAssessmentForm((f) => ({ ...f, monthlyExpenses: e.target.value }))} />
                  </label>
                </div>
                <label className="flex items-center gap-2 mb-2 text-[13px] text-text-700">
                  <input type="checkbox" checked={assessmentForm.creditBureauChecked} onChange={(e) => setAssessmentForm((f) => ({ ...f, creditBureauChecked: e.target.checked }))} />
                  Credit bureau checked manually outside the system
                </label>
                {assessmentForm.creditBureauChecked && (
                  <input className="input mb-4" placeholder="Bureau check notes" value={assessmentForm.creditBureauNotes} onChange={(e) => setAssessmentForm((f) => ({ ...f, creditBureauNotes: e.target.value }))} />
                )}
                <button type="submit" disabled={busy} className="btn-primary">Run assessment</button>
                <p className="text-text-muted text-xs mt-2">Existing loan obligations and this loan's own installment are computed automatically from real data — only income and expenses need entering.</p>
              </form>
            )}

            {assessment && (
              <div className="card p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold text-base text-ink-900">Credit Assessment</h2>
                  <span className={`badge ${assessment.recommendation === "APPROVE" ? "bg-green-100 text-green-600" : assessment.recommendation === "DECLINE" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>
                    {assessment.overridden ? "OVERRIDDEN" : assessment.recommendation}
                  </span>
                </div>
                <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-4">
                  <Stat label="Risk score" value={`${assessment.riskScore}/100`} />
                  <Stat label="Debt-to-income" value={`${assessment.debtToIncomeRatio}%`} />
                  <Stat label="Repayment capacity" value={`${assessment.repaymentCapacityRatio}%`} />
                  <Stat label="Other obligations" value={`GHS ${Number(assessment.existingLoanObligations).toLocaleString()}`} />
                </div>
                <div className="text-[13px] text-text-700 space-y-1 mb-4">
                  {assessment.scoreBreakdown.map((f: any, i: number) => (
                    <div key={i} className="flex justify-between border-t border-paper-100 pt-1 first:border-0 first:pt-0">
                      <span>{f.factor}</span><span className={f.points < 0 ? "text-rose-600" : "text-text-muted"}>{f.points > 0 ? "+" : ""}{f.points}</span>
                    </div>
                  ))}
                </div>
                {assessment.creditBureauChecked && <p className="text-text-muted text-xs mb-2">Credit bureau: checked manually — {assessment.creditBureauNotes || "no notes"}</p>}
                {assessment.overridden ? (
                  <p className="text-gold-600 text-xs">Overridden: {assessment.overrideReason}</p>
                ) : (
                  loan.status === "PENDING" && <button onClick={handleOverrideAssessment} className="btn-text text-gold-600">Override this recommendation</button>
                )}
              </div>
            )}

            <div className="card p-6 mb-8">
              <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Actions</h2>
              <div className="flex flex-wrap items-center gap-3">
                {loan.status === "PENDING" && (
                  <>
                    <button onClick={() => handleAction("approve")} disabled={busy} className="btn-primary">Approve</button>
                    <button onClick={() => handleAction("reject")} disabled={busy} className="px-4 py-2.5 rounded-[10px] border border-rose-600 text-rose-600 font-semibold text-sm hover:bg-rose-100 transition">Reject</button>
                  </>
                )}
                {loan.status === "APPROVED" && (
                  <button onClick={() => handleAction("disburse")} disabled={busy} className="btn-primary">Disburse</button>
                )}
                {(loan.status === "DISBURSED" || loan.status === "ACTIVE") && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted font-mono pointer-events-none">GHS</span>
                      <input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" className="input pl-12 !w-40" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
                    </div>
                    <button onClick={handleRepayment} disabled={busy} className="btn-primary">Record repayment</button>
                  </div>
                )}
                {["REJECTED", "CLOSED", "DEFAULTED"].includes(loan.status) && (
                  <p className="text-text-muted text-sm">No further actions available for this loan.</p>
                )}
              </div>
            </div>

            {/* Account Holders — doc §36. loan.customer above is the Primary Holder. */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Account holders</h2>
            <form onSubmit={handleAddHolder} className="card p-5 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <select required className="input !py-1.5" value={holderForm.customerId} onChange={(e) => setHolderForm((f) => ({ ...f, customerId: e.target.value }))}>
                  <option value="">Select customer…</option>
                  {customers.filter((c) => c.id !== loan.customer.id).map((c) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                </select>
                <select className="input !py-1.5" value={holderForm.role} onChange={(e) => setHolderForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="JOINT">Joint Account Holder</option>
                  <option value="AUTHORISED_SIGNATORY">Authorised Signatory</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="NOMINEE">Nominee</option>
                  <option value="POWER_OF_ATTORNEY">Power of Attorney</option>
                  <option value="CORPORATE_REPRESENTATIVE">Corporate Representative</option>
                </select>
                <button type="submit" disabled={busy} className="btn-text text-gold-600 justify-self-start">+ Add holder</button>
              </div>
            </form>
            <div className="space-y-2 mb-10">
              {(loan.accountHolders || []).map((h: any) => (
                <div key={h.id} className="card p-3 flex items-center justify-between text-[13px]">
                  <span className="text-text-700"><b className="text-text-900">{h.customer.fullName}</b> · {h.role.replaceAll("_", " ")}</span>
                  <button onClick={() => handleRemoveHolder(h.id)} className="text-rose-600 text-[12px]">Remove</button>
                </div>
              ))}
              {(!loan.accountHolders || loan.accountHolders.length === 0) && <p className="text-text-muted text-sm">No additional holders — {loan.customer.fullName} is the sole (primary) holder.</p>}
            </div>

            {loan.installments && loan.installments.length > 0 && (
              <>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">
                  Amortization schedule <span className="text-text-muted font-normal text-sm">({loan.interestMethod === "REDUCING_BALANCE" ? "Reducing balance" : "Flat"})</span>
                </h2>
                <div className="card overflow-x-auto mb-10">
                  <table className="w-full min-w-[680px] text-sm table-modern">
                    <thead><tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Total due</th><th>Paid</th><th>Status</th></tr></thead>
                    <tbody>
                      {loan.installments.map((inst: any) => {
                        const paid = Number(inst.principalPaid) + Number(inst.interestPaid);
                        const statusColor =
                          inst.status === "PAID" ? "bg-green-100 text-green-600"
                          : inst.status === "PARTIALLY_PAID" ? "bg-gold-500/15 text-gold-600"
                          : inst.status === "OVERDUE" ? "bg-rose-100 text-rose-600"
                          : "bg-violet-500/15 text-violet-500";
                        return (
                          <tr key={inst.id}>
                            <td className="text-text-700">{inst.installmentNumber}</td>
                            <td className="text-text-700 whitespace-nowrap">{new Date(inst.dueDate).toLocaleDateString()}</td>
                            <td className="text-text-700">GHS {Number(inst.principalDue).toLocaleString()}</td>
                            <td className="text-text-700">GHS {Number(inst.interestDue).toLocaleString()}</td>
                            <td className="text-text-900 font-medium">GHS {Number(inst.totalDue).toLocaleString()}</td>
                            <td className="text-green-600 font-mono">GHS {paid.toLocaleString()}</td>
                            <td><span className={`badge ${statusColor}`}>{inst.status.replaceAll("_", " ")}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Repayment history</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm table-modern">
                <thead><tr><th>Date</th><th>Amount</th></tr></thead>
                <tbody>
                  {loan.repayments.map((r: any) => (
                    <tr key={r.id}>
                      <td className="text-text-700">{new Date(r.paidAt).toLocaleString()}</td>
                      <td className="text-green-600 font-mono">+GHS {Number(r.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                  {loan.repayments.length === 0 && (
                    <tr><td colSpan={2} className="text-center text-text-muted text-sm py-8">No repayments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* doc §71 Loan Penalty Management */}
            {/* doc §65 Guarantor Management */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3 mt-10">Guarantors</h2>
            {["PENDING", "APPROVED", "DISBURSED", "ACTIVE"].includes(loan.status) && (
              <form onSubmit={handleAddGuarantor} className="card p-5 mb-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                  <input required className="input" value={guarantorForm.fullName} onChange={(e) => setGuarantorForm((f) => ({ ...f, fullName: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                  <input required className="input" value={guarantorForm.phone} onChange={(e) => setGuarantorForm((f) => ({ ...f, phone: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Relationship</span>
                  <input required className="input !w-32" value={guarantorForm.relationship} onChange={(e) => setGuarantorForm((f) => ({ ...f, relationship: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Guarantee limit (GHS)</span>
                  <input required type="number" step="0.01" min="0.01" className="input !w-32" value={guarantorForm.guaranteeLimit} onChange={(e) => setGuarantorForm((f) => ({ ...f, guaranteeLimit: e.target.value }))} />
                </label>
                <button type="submit" disabled={busy} className="btn-primary">Add</button>
              </form>
            )}
            <div className="card overflow-x-auto mb-10">
              <table className="w-full min-w-[600px] text-sm table-modern">
                <thead><tr><th>Name</th><th>Phone</th><th>Relationship</th><th>Limit</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {guarantors.map((g: any) => (
                    <tr key={g.id}>
                      <td className="text-text-900 font-medium">{g.fullName}</td>
                      <td className="text-text-700">{g.phone}</td>
                      <td className="text-text-700">{g.relationship}</td>
                      <td className="text-text-900 font-medium">GHS {Number(g.guaranteeLimit).toLocaleString()}</td>
                      <td><span className={`badge ${g.status === "APPROVED" ? "bg-green-100 text-green-600" : g.status === "RELEASED" ? "bg-paper-100 text-text-muted" : "bg-gold-500/15 text-gold-600"}`}>{g.status}</span></td>
                      <td className="whitespace-nowrap space-x-2">
                        {g.status === "PENDING" && <button onClick={() => handleApproveGuarantor(g.id)} className="btn-text text-green-600">Approve</button>}
                        {g.status !== "RELEASED" && <button onClick={() => handleReleaseGuarantor(g.id)} className="btn-text text-rose-600">Release</button>}
                      </td>
                    </tr>
                  ))}
                  {guarantors.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No guarantors registered.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* doc §66 Collateral Management */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3 mt-10">Collateral</h2>
            {["APPROVED", "DISBURSED", "ACTIVE"].includes(loan.status) && (
              <form onSubmit={handleAddCollateral} className="card p-5 mb-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Type</span>
                  <select className="input" value={collateralForm.type} onChange={(e) => setCollateralForm((f) => ({ ...f, type: e.target.value }))}>
                    {["LAND", "BUILDING", "VEHICLE", "EQUIPMENT", "INVENTORY", "OTHER"].map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </label>
                <label className="block flex-1 min-w-[160px]">
                  <span className="block text-[13px] text-text-500 mb-1.5">Description</span>
                  <input required className="input" value={collateralForm.description} onChange={(e) => setCollateralForm((f) => ({ ...f, description: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Owner name</span>
                  <input required className="input" value={collateralForm.ownerName} onChange={(e) => setCollateralForm((f) => ({ ...f, ownerName: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Value (GHS)</span>
                  <input required type="number" step="0.01" min="0.01" className="input !w-32" value={collateralForm.estimatedValue} onChange={(e) => setCollateralForm((f) => ({ ...f, estimatedValue: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Valuation date</span>
                  <input required type="date" className="input" value={collateralForm.valuationDate} onChange={(e) => setCollateralForm((f) => ({ ...f, valuationDate: e.target.value }))} />
                </label>
                <button type="submit" disabled={busy} className="btn-primary">Add</button>
              </form>
            )}
            <div className="card overflow-x-auto mb-10">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Type</th><th>Description</th><th>Owner</th><th>Value</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {collateralList.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-700">{c.type}</td>
                      <td className="text-text-900">{c.description}</td>
                      <td className="text-text-700">{c.ownerName}</td>
                      <td className="text-text-900 font-medium">GHS {Number(c.estimatedValue).toLocaleString()}</td>
                      <td><span className={`badge ${c.status === "PLEDGED" ? "bg-gold-500/15 text-gold-600" : c.status === "RELEASED" ? "bg-paper-100 text-text-muted" : "bg-rose-100 text-rose-600"}`}>{c.status}</span></td>
                      <td>{c.status === "PLEDGED" && <button onClick={() => handleReleaseCollateral(c.id)} className="btn-text text-rose-600">Release</button>}</td>
                    </tr>
                  ))}
                  {collateralList.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No collateral registered.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* doc §72/§73/§74 — all route through the Approval Workflow */}
            {["DISBURSED", "ACTIVE"].includes(loan.status) && (
              <>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-3 mt-10">Restructure / Reschedule / Write-Off</h2>
                <div className="grid grid-cols-1 dt:grid-cols-3 gap-4 mb-10">
                  <form onSubmit={handleRequestRestructure} className="card p-4">
                    <div className="font-medium text-[13px] text-text-900 mb-2">Restructure</div>
                    <input required type="number" step="0.01" placeholder="New principal" className="input !text-[12px] mb-2" value={restructureForm.newPrincipal} onChange={(e) => setRestructureForm((f) => ({ ...f, newPrincipal: e.target.value }))} />
                    <input required type="number" step="0.01" placeholder="New rate %" className="input !text-[12px] mb-2" value={restructureForm.newRate} onChange={(e) => setRestructureForm((f) => ({ ...f, newRate: e.target.value }))} />
                    <input required type="number" placeholder="New term (months)" className="input !text-[12px] mb-2" value={restructureForm.newTermMonths} onChange={(e) => setRestructureForm((f) => ({ ...f, newTermMonths: e.target.value }))} />
                    <input required placeholder="Reason" className="input !text-[12px] mb-2" value={restructureForm.reason} onChange={(e) => setRestructureForm((f) => ({ ...f, reason: e.target.value }))} />
                    <button type="submit" disabled={busy} className="btn-text text-gold-600">Request</button>
                  </form>
                  <form onSubmit={handleRequestReschedule} className="card p-4">
                    <div className="font-medium text-[13px] text-text-900 mb-2">Reschedule</div>
                    <input required type="number" placeholder="Shift days (+/-)" className="input !text-[12px] mb-2" value={rescheduleForm.shiftDays} onChange={(e) => setRescheduleForm((f) => ({ ...f, shiftDays: e.target.value }))} />
                    <input required placeholder="Reason" className="input !text-[12px] mb-2" value={rescheduleForm.reason} onChange={(e) => setRescheduleForm((f) => ({ ...f, reason: e.target.value }))} />
                    <button type="submit" disabled={busy} className="btn-text text-gold-600">Request</button>
                  </form>
                  <form onSubmit={handleRequestWriteOff} className="card p-4">
                    <div className="font-medium text-[13px] text-text-900 mb-2">Write-off</div>
                    <input required type="number" step="0.01" placeholder="Amount (GHS)" className="input !text-[12px] mb-2" value={writeOffForm.amount} onChange={(e) => setWriteOffForm((f) => ({ ...f, amount: e.target.value }))} />
                    <input required placeholder="Reason" className="input !text-[12px] mb-2" value={writeOffForm.reason} onChange={(e) => setWriteOffForm((f) => ({ ...f, reason: e.target.value }))} />
                    <button type="submit" disabled={busy} className="btn-text text-rose-600">Request</button>
                  </form>
                </div>
                {(restructures.length > 0 || reschedules.length > 0 || writeOffs.length > 0) && (
                  <div className="text-[12.5px] text-text-700 mb-10 space-y-1">
                    {restructures.map((r: any) => <div key={r.id}>Restructure to GHS {Number(r.newPrincipal).toLocaleString()} @ {r.newRate}% / {r.newTermMonths}mo — {r.appliedAt ? "applied" : "pending approval"}</div>)}
                    {reschedules.map((r: any) => <div key={r.id}>Reschedule {r.shiftDays > 0 ? "+" : ""}{r.shiftDays} days — {r.appliedAt ? "applied" : "pending approval"}</div>)}
                    {writeOffs.map((w: any) => (
                      <div key={w.id} className="flex items-center gap-2">
                        Write-off GHS {Number(w.amount).toLocaleString()} — {w.appliedAt ? `applied, GHS ${Number(w.recoveredAmount).toLocaleString()} recovered` : "pending approval"}
                        {w.appliedAt && <button onClick={() => handleRecordRecovery(w.id)} className="btn-text text-gold-600">Record recovery</button>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3 mt-10">Penalties</h2>
            {["DISBURSED", "ACTIVE"].includes(loan.status) && (
              <form onSubmit={handleApplyPenalty} className="card p-5 mb-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Method</span>
                  <select className="input" value={penaltyForm.calculationMethod} onChange={(e) => setPenaltyForm((f) => ({ ...f, calculationMethod: e.target.value }))}>
                    <option value="PERCENTAGE">Percentage of arrears</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">{penaltyForm.calculationMethod === "PERCENTAGE" ? "Rate (%)" : "Amount (GHS)"}</span>
                  <input required type="number" step="0.01" min="0.01" className="input !w-32" value={penaltyForm.rateOrAmount} onChange={(e) => setPenaltyForm((f) => ({ ...f, rateOrAmount: e.target.value }))} />
                </label>
                <button type="submit" disabled={busy} className="btn-primary">Apply penalty</button>
              </form>
            )}
            <div className="card overflow-x-auto mb-10">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Applied</th><th>Method</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {penalties.map((p: any) => (
                    <tr key={p.id}>
                      <td className="text-text-700">{new Date(p.appliedAt).toLocaleDateString()}</td>
                      <td className="text-text-700">{p.calculationMethod === "PERCENTAGE" ? `${p.rateOrAmount}%` : "Fixed"}</td>
                      <td className="text-text-900 font-medium">GHS {Number(p.amount).toLocaleString()}</td>
                      <td><span className={`badge ${p.status === "APPLIED" ? "bg-rose-100 text-rose-600" : "bg-paper-100 text-text-muted"}`}>{p.status}</span></td>
                      <td>{p.status === "APPLIED" && <button onClick={() => handleWaivePenalty(p.id)} className="btn-text text-gold-600">Waive</button>}</td>
                    </tr>
                  ))}
                  {penalties.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No penalties applied.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* doc §77.2 Promise-to-Pay Recording */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Promises to pay</h2>
            {["DISBURSED", "ACTIVE"].includes(loan.status) && (
              <form onSubmit={handleRecordPromise} className="card p-5 mb-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Amount (GHS)</span>
                  <input required type="number" step="0.01" min="0.01" className="input !w-32" value={promiseForm.promisedAmount} onChange={(e) => setPromiseForm((f) => ({ ...f, promisedAmount: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">Promised date</span>
                  <input required type="date" className="input" value={promiseForm.promisedDate} onChange={(e) => setPromiseForm((f) => ({ ...f, promisedDate: e.target.value }))} />
                </label>
                <label className="block flex-1 min-w-[180px]">
                  <span className="block text-[13px] text-text-500 mb-1.5">Notes (optional)</span>
                  <input className="input" value={promiseForm.notes} onChange={(e) => setPromiseForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. spoke by phone, cites late salary" />
                </label>
                <button type="submit" disabled={busy} className="btn-primary">Record</button>
              </form>
            )}
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm table-modern">
                <thead><tr><th>Recorded</th><th>Promised Date</th><th>Amount</th><th>Notes</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {promises.map((p: any) => (
                    <tr key={p.id}>
                      <td className="text-text-700">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="text-text-700">{new Date(p.promisedDate).toLocaleDateString()}</td>
                      <td className="text-text-900 font-medium">GHS {Number(p.promisedAmount).toLocaleString()}</td>
                      <td className="text-text-700 text-[12.5px]">{p.notes || "—"}</td>
                      <td><span className={`badge ${p.status === "KEPT" ? "bg-green-100 text-green-600" : p.status === "BROKEN" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{p.status}</span></td>
                      <td className="whitespace-nowrap space-x-2">
                        {p.status === "PENDING" && (
                          <>
                            <button onClick={() => handlePromiseStatus(p.id, "KEPT")} className="btn-text text-green-600">Kept</button>
                            <button onClick={() => handlePromiseStatus(p.id, "BROKEN")} className="btn-text text-rose-600">Broken</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {promises.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No promises to pay recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="font-display font-semibold text-lg text-gold-600 selectable">{value}</div>
      <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
