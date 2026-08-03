"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function CollectionsPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<"collectors" | "routes" | "transactions">("collectors");

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
  const [busy, setBusy] = useState(false);

  function load() {
    api.listCollectors().then((r) => setCollectors(r.collectors)).catch((e) => setError(e.message));
    api.listCollectionRoutes().then((r) => setRoutes(r.routes)).catch(() => {});
    api.listEmployees().then((r) => setEmployees(r.employees)).catch(() => {});
    api.listBranches().then((r) => setBranches(r.branches)).catch(() => {});
    api.listCustomers().then((r) => setCustomers(r.customers)).catch(() => {});
    api.listCollectionTransactions().then((r) => setTransactions(r.transactions)).catch(() => {});
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
      </div>
    </AppShell>
  );
}
