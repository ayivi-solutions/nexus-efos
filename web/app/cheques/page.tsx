"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const STATUS_BADGE: Record<string, string> = {
  RECEIVED: "bg-gold-500/15 text-gold-600",
  ISSUED: "bg-gold-500/15 text-gold-600",
  PENDING_CLEARING: "bg-blue-100 text-blue-600",
  CLEARED: "bg-green-100 text-green-600",
  BOUNCED: "bg-rose-100 text-rose-600",
  STOPPED: "bg-rose-100 text-rose-600",
  CANCELLED: "bg-text-muted/15 text-text-muted",
};

export default function ChequesPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [view, setView] = useState<"all" | "pending-confirmation">("pending-confirmation");
  const [cheques, setCheques] = useState<any[]>([]);
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState({
    direction: "OUTWARD" as "INWARD" | "OUTWARD",
    chequeNumber: "",
    bankName: "",
    chequeDate: "",
    amount: "",
    payerName: "",
    payeeName: "",
    loanId: "",
  });

  function load() {
    const call = view === "pending-confirmation" ? api.listPendingConfirmationCheques() : api.listCheques({ direction: directionFilter || undefined, status: statusFilter || undefined });
    call.then((r) => setCheques(r.cheques)).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [view, directionFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setBusy("record"); setError(null);
    try {
      await api.recordCheque({
        direction: form.direction,
        chequeNumber: form.chequeNumber,
        bankName: form.bankName,
        chequeDate: form.chequeDate,
        amount: Number(form.amount),
        payerName: form.direction === "INWARD" ? form.payerName || undefined : undefined,
        payeeName: form.direction === "OUTWARD" ? form.payeeName || undefined : undefined,
        loanId: form.loanId || undefined,
      });
      toast.success("Cheque recorded.");
      setForm({ direction: "OUTWARD", chequeNumber: "", bankName: "", chequeDate: "", amount: "", payerName: "", payeeName: "", loanId: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not record cheque"); } finally { setBusy(null); }
  }

  async function handleAction(id: string, action: "confirm" | "submit-clearing" | "clear" | "stop" | "cancel" | "bounce") {
    setBusy(id); setError(null);
    try {
      if (action === "confirm") await api.confirmCheque(id);
      else if (action === "submit-clearing") await api.submitChequeForClearing(id);
      else if (action === "clear") await api.clearCheque(id);
      else if (action === "stop") await api.stopCheque(id);
      else if (action === "cancel") await api.cancelCheque(id);
      else if (action === "bounce") {
        const reason = window.prompt("Reason the cheque bounced:");
        if (reason === null || reason.trim() === "") { setBusy(null); return; }
        await api.bounceCheque(id, reason);
      }
      load();
    } catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  return (
    <AppShell active="Cheques">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Cheques</h1>
        <p className="text-text-muted text-sm mb-6">
          Cheque register — both directions, with a real clearing lifecycle. Not from the working documents; built from the Operations Supervisor role schedule&apos;s named task: &quot;monitor and confirm outgoing cheques daily and during disbursements.&quot;
        </p>

        <form onSubmit={handleRecord} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
          <select className="input !w-28" value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as "INWARD" | "OUTWARD" }))}>
            <option value="OUTWARD">Outward</option>
            <option value="INWARD">Inward</option>
          </select>
          <input required placeholder="Cheque number" className="input !w-36" value={form.chequeNumber} onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))} />
          <input required placeholder="Bank" className="input !w-36" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
          <input required type="date" className="input" value={form.chequeDate} onChange={(e) => setForm((f) => ({ ...f, chequeDate: e.target.value }))} title="Cheque date — a future date is a post-dated cheque" />
          <input required type="number" step="0.01" placeholder="Amount" className="input !w-32" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          {form.direction === "INWARD" ? (
            <input required placeholder="Payer name" className="input flex-1 min-w-[140px]" value={form.payerName} onChange={(e) => setForm((f) => ({ ...f, payerName: e.target.value }))} />
          ) : (
            <>
              <input required placeholder="Payee name" className="input flex-1 min-w-[140px]" value={form.payeeName} onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))} />
              <input placeholder="Loan ID (disbursement, optional)" className="input !w-48" value={form.loanId} onChange={(e) => setForm((f) => ({ ...f, loanId: e.target.value }))} />
            </>
          )}
          <button type="submit" disabled={busy === "record"} className="btn-primary">Record cheque</button>
        </form>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => setView("pending-confirmation")} className={`btn-text ${view === "pending-confirmation" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Pending confirmation</button>
          <button onClick={() => setView("all")} className={`btn-text ${view === "all" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Full register</button>
          {view === "all" && (
            <>
              <select className="input !w-32 ml-2" value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
                <option value="">All directions</option>
                <option value="INWARD">Inward</option>
                <option value="OUTWARD">Outward</option>
              </select>
              <select className="input !w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {Object.keys(STATUS_BADGE).map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
              </select>
            </>
          )}
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm table-modern">
            <thead>
              <tr>
                <th>Direction</th><th>Cheque #</th><th>Bank</th><th>Date</th><th>Amount</th><th>Party</th><th>Status</th><th>Confirmed</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((c: any) => (
                <tr key={c.id}>
                  <td className="text-text-700">{c.direction}</td>
                  <td className="text-text-900 font-medium">{c.chequeNumber}</td>
                  <td className="text-text-700">{c.bankName}</td>
                  <td className="text-text-700">{new Date(c.chequeDate).toLocaleDateString()}</td>
                  <td className="text-text-900 font-medium">GHS {Number(c.amount).toLocaleString()}</td>
                  <td className="text-text-700">{c.direction === "INWARD" ? c.payerName : c.payeeName}</td>
                  <td><span className={`badge ${STATUS_BADGE[c.status] || ""}`}>{c.status.replaceAll("_", " ")}</span></td>
                  <td className="text-text-muted text-[12px]">{c.confirmedAt ? new Date(c.confirmedAt).toLocaleDateString() : "—"}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-2">
                      {(!c.confirmedAt || new Date(c.confirmedAt).toDateString() !== new Date().toDateString()) && (
                        <button disabled={busy === c.id} onClick={() => handleAction(c.id, "confirm")} className="btn-text text-gold-600">Confirm</button>
                      )}
                      {(c.status === "RECEIVED" || c.status === "ISSUED") && (
                        <>
                          <button disabled={busy === c.id} onClick={() => handleAction(c.id, "submit-clearing")} className="btn-text text-blue-600">Submit</button>
                          {c.direction === "OUTWARD" && <button disabled={busy === c.id} onClick={() => handleAction(c.id, "stop")} className="btn-text text-rose-600">Stop</button>}
                          <button disabled={busy === c.id} onClick={() => handleAction(c.id, "cancel")} className="btn-text text-text-muted">Cancel</button>
                        </>
                      )}
                      {c.status === "PENDING_CLEARING" && (
                        <>
                          <button disabled={busy === c.id} onClick={() => handleAction(c.id, "clear")} className="btn-text text-green-600">Clear</button>
                          <button disabled={busy === c.id} onClick={() => handleAction(c.id, "bounce")} className="btn-text text-rose-600">Bounce</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {cheques.length === 0 && <tr><td colSpan={9} className="text-center text-text-muted text-sm py-8">{view === "pending-confirmation" ? "Nothing pending confirmation today." : "No cheques recorded."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
