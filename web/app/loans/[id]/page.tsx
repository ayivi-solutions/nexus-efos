"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
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

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [loan, setLoan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busy, setBusy] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");

  function load() {
    api.getLoan(id).then((res) => setLoan(res.loan)).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <span className={`badge ${STATUS_COLOR[loan.status] || ""}`}>{loan.status}</span>
            </div>

            <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-8">
              <Stat label="Principal" value={`GHS ${Number(loan.principal).toLocaleString()}`} />
              <Stat label="Interest rate" value={`${loan.interestRate}% p.a.`} />
              <Stat label="Term" value={`${loan.termMonths} months`} />
              <Stat label="Initiated" value={new Date(loan.createdAt).toLocaleDateString()} />
            </div>

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
