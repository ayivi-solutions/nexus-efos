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

  function load() {
    api.getLoan(id).then((res) => setLoan(res.loan)).catch((err) => setError(err.message));
    api.listPromisesToPay(id).then((res) => setPromises(res.promises)).catch(() => {});
    api.listLoanPenalties(id).then((res) => setPenalties(res.penalties)).catch(() => {});
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
