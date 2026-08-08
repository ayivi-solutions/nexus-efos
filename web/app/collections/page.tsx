"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function CollectionsPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"collectors" | "routes" | "transactions" | "settlements" | "commission" | "risk">("collectors");

  const [collectors, setCollectors] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [collectorForm, setCollectorForm] = useState({ employeeId: "" });
  const [routeForm, setRouteForm] = useState({ name: "", branchId: "", collectorId: "" });
  const [assignForm, setAssignForm] = useState<Record<string, string>>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [collectForm, setCollectForm] = useState({ type: "SAVINGS_DEPOSIT", collectorId: "", customerId: "", targetId: "", amount: "" });
  const [settlements, setSettlements] = useState<any[]>([]);
  const [settleForm, setSettleForm] = useState({ collectorId: "", settlementDate: "", actualAmount: "", notes: "" });
  const [structures, setStructures] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [delinquencyRisk, setDelinquencyRisk] = useState<any[]>([]);
  const [structureForm, setStructureForm] = useState({ name: "", type: "PERCENTAGE_OF_COLLECTIONS", rate: "" });
  const [calcForm, setCalcForm] = useState({ collectorId: "", structureId: "", periodStart: "", periodEnd: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api.listCollectors().then((r) => setCollectors(r.collectors)).catch((e) => setError(e.message));
    api.listCollectionRoutes().then((r) => setRoutes(r.routes)).catch(() => {});
    api.listEmployees().then((r) => setEmployees(r.employees)).catch(() => {});
    api.listBranches().then((r) => setBranches(r.branches)).catch(() => {});
    api.listCustomers().then((r) => setCustomers(r.customers)).catch(() => {});
    api.listCollectionTransactions().then((r) => setTransactions(r.transactions)).catch(() => {});
    api.listSettlements().then((r) => setSettlements(r.settlements)).catch(() => {});
    api.listCommissionStructures().then((r) => setStructures(r.structures)).catch(() => {});
    api.listCommissionRecords().then((r) => setRecords(r.records)).catch(() => {});
    api.getDelinquencyRisk().then((r) => setDelinquencyRisk(r.loans)).catch(() => {});
  }

  async function handleCreateStructure(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createCommissionStructure({ ...structureForm, rate: Number(structureForm.rate) });
      setStructureForm({ name: "", type: "PERCENTAGE_OF_COLLECTIONS", rate: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not create structure"); } finally { setBusy(false); }
  }

  async function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.calculateCommission(calcForm);
      toast.success("Commission calculated.");
      setCalcForm({ collectorId: "", structureId: "", periodStart: "", periodEnd: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not calculate commission"); } finally { setBusy(false); }
  }

  async function handleRequestPayment(id: string) {
    setBusy(true); setError(null);
    try { await api.requestCommissionPayment(id); toast.info("Payment submitted for approval."); load(); }
    catch (err: any) { setError(err.message || "Could not request payment"); } finally { setBusy(false); }
  }

  async function handleRecordSettlement(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.recordSettlement({ ...settleForm, actualAmount: Number(settleForm.actualAmount) });
      toast.success("Settlement recorded.");
      setSettleForm({ collectorId: "", settlementDate: "", actualAmount: "", notes: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not record settlement"); } finally { setBusy(false); }
  }

  async function handleRecordCollection(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.recordCollection({ ...collectForm, amount: Number(collectForm.amount) });
      toast.success(`Recorded — ${res.transactionNumber}`);
      setCollectForm({ type: "SAVINGS_DEPOSIT", collectorId: "", customerId: "", targetId: "", amount: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not record collection"); } finally { setBusy(false); }
  }

  async function handleReverse(id: string) {
    const reason = window.prompt("Reason for reversing this collection:");
    if (!reason) return;
    setBusy(true); setError(null);
    try { await api.reverseCollection(id, reason); load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleRegisterCollector(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.registerCollector(collectorForm);
      setCollectorForm({ employeeId: "" });
      toast.success("Collector registered.");
      load();
    } catch (err: any) { setError(err.message || "Could not register collector"); } finally { setBusy(false); }
  }

  async function handleSuspend(id: string) {
    const reason = window.prompt("Reason for suspending this collector:");
    if (reason === null) return;
    setBusy(true); setError(null);
    try { await api.suspendCollector(id, reason); load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  async function handleReinstate(id: string) {
    setBusy(true); setError(null);
    try { await api.reinstateCollector(id); load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleCreateRoute(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createCollectionRoute({ name: routeForm.name, branchId: routeForm.branchId || undefined, collectorId: routeForm.collectorId || undefined });
      setRouteForm({ name: "", branchId: "", collectorId: "" });
      toast.success("Route created.");
      load();
    } catch (err: any) { setError(err.message || "Could not create route"); } finally { setBusy(false); }
  }

  async function handleAssignCustomer(routeId: string) {
    const customerId = assignForm[routeId];
    if (!customerId) return;
    setBusy(true); setError(null);
    try {
      await api.assignCustomerToRoute(routeId, customerId);
      setAssignForm((f) => ({ ...f, [routeId]: "" }));
      load();
    } catch (err: any) { setError(err.message || "Could not assign customer"); } finally { setBusy(false); }
  }

  async function handleRemoveCustomer(routeId: string, assignmentId: string) {
    setBusy(true); setError(null);
    try { await api.removeCustomerFromRoute(routeId, assignmentId); load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  const registeredEmployeeIds = new Set(collectors.map((c) => c.employeeId));

  return (
    <AppShell active="Collections">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Collections</h1>
        <p className="text-text-muted text-sm mb-6">doc §79/§80 — field collector and route administration. Offline field collection itself is a separate, dedicated effort (see the build log).</p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("collectors")} className={`btn-text ${tab === "collectors" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Collectors</button>
          <button onClick={() => setTab("routes")} className={`btn-text ${tab === "routes" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Routes</button>
          <button onClick={() => setTab("transactions")} className={`btn-text ${tab === "transactions" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Daily Collections</button>
          <button onClick={() => setTab("settlements")} className={`btn-text ${tab === "settlements" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Settlements</button>
          <button onClick={() => setTab("commission")} className={`btn-text ${tab === "commission" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Commission</button>
          <button onClick={() => setTab("risk")} className={`btn-text ${tab === "risk" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Delinquency Risk</button>
        </div>

        {tab === "collectors" && (
          <>
            <form onSubmit={handleRegisterCollector} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <label className="block flex-1 min-w-[220px]">
                <span className="block text-[13px] text-text-500 mb-1.5">Employee</span>
                <select required className="input" value={collectorForm.employeeId} onChange={(e) => setCollectorForm({ employeeId: e.target.value })}>
                  <option value="">— Select —</option>
                  {employees.filter((e: any) => !registeredEmployeeIds.has(e.id)).map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
                </select>
              </label>
              <button type="submit" disabled={busy} className="btn-primary">Register collector</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Name</th><th>Branch</th><th>Availability</th><th>Active Routes</th><th></th></tr></thead>
                <tbody>
                  {collectors.map((c: any) => (
                    <tr key={c.id}>
                      <td className="text-text-900 font-medium">{c.employee?.fullName || "—"}</td>
                      <td className="text-text-700">{branches.find((b: any) => b.id === c.branchId)?.name || "—"}</td>
                      <td><span className={`badge ${c.availability === "AVAILABLE" ? "bg-green-100 text-green-600" : c.availability === "SUSPENDED" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{c.availability}</span></td>
                      <td className="text-text-700">{c.routes?.map((r: any) => r.name).join(", ") || "—"}</td>
                      <td>{c.availability === "SUSPENDED" ? <button onClick={() => handleReinstate(c.id)} className="btn-text text-green-600">Reinstate</button> : <button onClick={() => handleSuspend(c.id)} className="btn-text text-rose-600">Suspend</button>}</td>
                    </tr>
                  ))}
                  {collectors.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No collectors registered.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "routes" && (
          <>
            <form onSubmit={handleCreateRoute} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Route name</span>
                <input required className="input" value={routeForm.name} onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Branch</span>
                <select className="input" value={routeForm.branchId} onChange={(e) => setRouteForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">—</option>
                  {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Collector</span>
                <select className="input" value={routeForm.collectorId} onChange={(e) => setRouteForm((f) => ({ ...f, collectorId: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {collectors.map((c: any) => (<option key={c.id} value={c.id}>{c.employee?.fullName}</option>))}
                </select>
              </label>
              <button type="submit" disabled={busy} className="btn-primary">Create route</button>
            </form>

            {routes.map((r: any) => (
              <div key={r.id} className="card p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display font-semibold text-base text-ink-900">{r.name}</span>
                  <span className="text-text-muted text-xs">{r.customers?.length || 0} customer(s)</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="input !text-[12px]" value={assignForm[r.id] || ""} onChange={(e) => setAssignForm((f) => ({ ...f, [r.id]: e.target.value }))}>
                    <option value="">Add customer to this route…</option>
                    {customers.map((c: any) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
                  </select>
                  <button onClick={() => handleAssignCustomer(r.id)} className="btn-text text-gold-600">Add</button>
                </div>
                <div className="text-[12.5px] text-text-700 space-y-1">
                  {(r.customers || []).map((assignment: any) => {
                    const cust = customers.find((c: any) => c.id === assignment.customerId);
                    return (
                      <div key={assignment.id} className="flex items-center justify-between border-t border-paper-100 pt-1">
                        <span>{cust?.fullName || assignment.customerId}</span>
                        <button onClick={() => handleRemoveCustomer(r.id, assignment.id)} className="btn-text text-rose-600 !text-[11px]">Remove</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {routes.length === 0 && <p className="text-text-muted text-sm text-center py-8">No routes created.</p>}
          </>
        )}
        {tab === "transactions" && (
          <>
            <form onSubmit={handleRecordCollection} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select className="input !w-36" value={collectForm.type} onChange={(e) => setCollectForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="SAVINGS_DEPOSIT">Savings Deposit</option>
                <option value="LOAN_REPAYMENT">Loan Repayment</option>
              </select>
              <select required className="input" value={collectForm.collectorId} onChange={(e) => setCollectForm((f) => ({ ...f, collectorId: e.target.value }))}>
                <option value="">Collector…</option>
                {collectors.filter((c: any) => c.availability === "AVAILABLE").map((c: any) => (<option key={c.id} value={c.id}>{c.employee?.fullName}</option>))}
              </select>
              <select required className="input" value={collectForm.customerId} onChange={(e) => setCollectForm((f) => ({ ...f, customerId: e.target.value }))}>
                <option value="">Customer…</option>
                {customers.map((c: any) => (<option key={c.id} value={c.id}>{c.fullName}</option>))}
              </select>
              <input required placeholder={collectForm.type === "SAVINGS_DEPOSIT" ? "Savings Account ID" : "Loan ID"} className="input !w-40" value={collectForm.targetId} onChange={(e) => setCollectForm((f) => ({ ...f, targetId: e.target.value }))} />
              <input required type="number" step="0.01" min="0.01" placeholder="Amount" className="input !w-28" value={collectForm.amount} onChange={(e) => setCollectForm((f) => ({ ...f, amount: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Record</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Txn #</th><th>Type</th><th>Amount</th><th>Collector</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {transactions.map((t: any) => (
                    <tr key={t.id}>
                      <td className="font-mono text-[12px] text-text-700">{t.transactionNumber}</td>
                      <td className="text-text-700">{t.type.replaceAll("_", " ")}</td>
                      <td className="text-text-900 font-medium">GHS {Number(t.amount).toLocaleString()}</td>
                      <td className="text-text-700">{collectors.find((c: any) => c.id === t.collectorId)?.employee?.fullName || "—"}</td>
                      <td><span className={`badge ${t.status === "COMPLETED" ? "bg-green-100 text-green-600" : "bg-rose-100 text-rose-600"}`}>{t.status}</span></td>
                      <td>{t.status === "COMPLETED" && <button onClick={() => handleReverse(t.id)} className="btn-text text-rose-600">Reverse</button>}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No collections recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "settlements" && (
          <>
            <form onSubmit={handleRecordSettlement} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={settleForm.collectorId} onChange={(e) => setSettleForm((f) => ({ ...f, collectorId: e.target.value }))}>
                <option value="">Collector…</option>
                {collectors.map((c: any) => (<option key={c.id} value={c.id}>{c.employee?.fullName}</option>))}
              </select>
              <input required type="date" className="input" value={settleForm.settlementDate} onChange={(e) => setSettleForm((f) => ({ ...f, settlementDate: e.target.value }))} />
              <input required type="number" step="0.01" placeholder="Cash counted (GHS)" className="input !w-40" value={settleForm.actualAmount} onChange={(e) => setSettleForm((f) => ({ ...f, actualAmount: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Settle</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm table-modern">
                <thead><tr><th>Date</th><th>Collector</th><th>Expected</th><th>Actual</th><th>Variance</th><th>Status</th></tr></thead>
                <tbody>
                  {settlements.map((s: any) => (
                    <tr key={s.id}>
                      <td className="text-text-700">{new Date(s.settlementDate).toLocaleDateString()}</td>
                      <td className="text-text-700">{collectors.find((c: any) => c.id === s.collectorId)?.employee?.fullName || "—"}</td>
                      <td className="text-text-700">GHS {Number(s.expectedAmount).toLocaleString()}</td>
                      <td className="text-text-700">GHS {Number(s.actualAmount).toLocaleString()}</td>
                      <td className={Number(s.variance) === 0 ? "text-text-700" : "text-rose-600 font-medium"}>GHS {Number(s.variance).toLocaleString()}</td>
                      <td><span className={`badge ${s.status === "RECONCILED" ? "bg-green-100 text-green-600" : "bg-gold-500/15 text-gold-600"}`}>{s.status.replaceAll("_", " ")}</span></td>
                    </tr>
                  ))}
                  {settlements.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No settlements recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "commission" && (
          <>
            <form onSubmit={handleCreateStructure} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <div className="font-medium text-[13px] text-text-900 mr-2">New structure:</div>
              <input required placeholder="Name" className="input !text-[12px] !w-32" value={structureForm.name} onChange={(e) => setStructureForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="input !text-[12px]" value={structureForm.type} onChange={(e) => setStructureForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="PERCENTAGE_OF_COLLECTIONS">% of collections</option>
                <option value="FIXED_PER_COLLECTION">Fixed per collection</option>
              </select>
              <input required type="number" step="0.01" placeholder="Rate" className="input !text-[12px] !w-24" value={structureForm.rate} onChange={(e) => setStructureForm((f) => ({ ...f, rate: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-text text-gold-600">Add</button>
            </form>

            <form onSubmit={handleCalculate} className="card p-5 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={calcForm.collectorId} onChange={(e) => setCalcForm((f) => ({ ...f, collectorId: e.target.value }))}>
                <option value="">Collector…</option>
                {collectors.map((c: any) => (<option key={c.id} value={c.id}>{c.employee?.fullName}</option>))}
              </select>
              <select required className="input" value={calcForm.structureId} onChange={(e) => setCalcForm((f) => ({ ...f, structureId: e.target.value }))}>
                <option value="">Structure…</option>
                {structures.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
              <input required type="date" className="input" value={calcForm.periodStart} onChange={(e) => setCalcForm((f) => ({ ...f, periodStart: e.target.value }))} />
              <input required type="date" className="input" value={calcForm.periodEnd} onChange={(e) => setCalcForm((f) => ({ ...f, periodEnd: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Calculate</button>
            </form>

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm table-modern">
                <thead><tr><th>Period</th><th>Collector</th><th>Collected</th><th>Commission</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {records.map((r: any) => (
                    <tr key={r.id}>
                      <td className="text-text-700">{new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}</td>
                      <td className="text-text-700">{collectors.find((c: any) => c.id === r.collectorId)?.employee?.fullName || "—"}</td>
                      <td className="text-text-700">GHS {Number(r.totalCollected).toLocaleString()} ({r.collectionCount})</td>
                      <td className="text-text-900 font-medium">GHS {Number(r.commissionAmount).toLocaleString()}</td>
                      <td><span className={`badge ${r.status === "PAID" ? "bg-green-100 text-green-600" : r.status === "PENDING_APPROVAL" ? "bg-gold-500/15 text-gold-600" : "bg-paper-100 text-text-muted"}`}>{r.status.replaceAll("_", " ")}</span></td>
                      <td>{r.status === "PENDING" && <button onClick={() => handleRequestPayment(r.id)} className="btn-text text-gold-600">Request payment</button>}</td>
                    </tr>
                  ))}
                  {records.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No commission records.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "risk" && (
          <>
            <p className="text-text-muted text-[12.5px] mb-4">
              EAIS §129.1 Delinquency Prediction — loans that are still <b>current</b> (not yet in arrears) but showing early warning signs: a shrinking payment buffer, a longer-than-usual gap since the last repayment, or other risk context. This is advisory only — it does not change arrears status, apply fees, or take any action. Confidence is lower for loans with fewer than 3 installments due so far (not enough history yet to judge a trend).
            </p>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm table-modern">
                <thead><tr><th>Customer</th><th>Phone</th><th>Principal</th><th>Buffer</th><th>Risk</th><th>Confidence</th><th>Why</th></tr></thead>
                <tbody>
                  {delinquencyRisk.map((l: any) => (
                    <tr key={l.loanId}>
                      <td className="text-text-900 font-medium">{l.customerName}</td>
                      <td className="text-text-700">{l.customerPhone}</td>
                      <td className="text-text-700">GHS {Number(l.principal).toLocaleString()}</td>
                      <td className={l.bufferRatio < 0 ? "text-rose-600" : "text-text-700"}>{(l.bufferRatio * 100).toFixed(1)}%</td>
                      <td>
                        <span className={`badge ${l.riskBand === "HIGH" ? "bg-rose-100 text-rose-600" : l.riskBand === "ELEVATED" ? "bg-gold-500/15 text-gold-600" : "bg-paper-100 text-text-muted"}`}>
                          {l.riskBand} ({l.riskScore})
                        </span>
                      </td>
                      <td className="text-text-muted text-[12px]">{l.confidence}</td>
                      <td className="text-text-muted text-[11.5px] max-w-[260px]">{l.breakdown.map((b: any) => b.factor).join("; ")}</td>
                    </tr>
                  ))}
                  {delinquencyRisk.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No loans currently flagged — everything current looks healthy.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
