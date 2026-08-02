"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const CATEGORIES = ["VALIDATION", "ELIGIBILITY", "CALCULATION", "APPROVAL", "COMPLIANCE", "NOTIFICATION"];
const TRIGGER_POINTS = ["LOAN_INITIATION", "LOAN_APPROVAL", "SAVINGS_ACCOUNT_OPENING", "CUSTOMER_CREATION"];
const OPERATORS = ["EQUALS", "NOT_EQUALS", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL", "CONTAINS"];
const ACTION_TYPES = ["FLAG", "REQUIRE_ADDITIONAL_APPROVAL", "REJECT"];

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-violet-500/15 text-violet-500",
  PENDING_APPROVAL: "bg-gold-500/15 text-gold-600",
  ACTIVE: "bg-green-100 text-green-600",
  RETIRED: "bg-paper-100 text-text-muted",
};

const emptyCondition = { field: "principal", operator: "GREATER_THAN", value: "" };
const emptyAction = { type: "FLAG", message: "" };

const emptyForm = {
  name: "", businessPurpose: "", description: "", category: "APPROVAL", triggerPoint: "LOAN_INITIATION",
  conditionLogic: "ALL", priority: "100", effectiveDate: "", expiryDate: "",
  conditions: [{ ...emptyCondition }], actions: [{ ...emptyAction }],
};

export default function BusinessRulesPage() {
  const toast = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api.listBusinessRules().then((res) => setRules(res.rules)).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);

  function updateCondition(i: number, key: string, value: string) {
    setForm((f) => {
      const conditions = [...f.conditions];
      conditions[i] = { ...conditions[i], [key]: value };
      return { ...f, conditions };
    });
  }
  function updateAction(i: number, key: string, value: string) {
    setForm((f) => {
      const actions = [...f.actions];
      actions[i] = { ...actions[i], [key]: value };
      return { ...f, actions };
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.createBusinessRule({
        ...form,
        priority: Number(form.priority),
        effectiveDate: form.effectiveDate || undefined,
        expiryDate: form.expiryDate || undefined,
        conditions: form.conditions.map((c) => ({ ...c, value: isNaN(Number(c.value)) ? c.value : Number(c.value) })),
      });
      toast.success("Rule created as DRAFT.");
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestActivation(id: string) {
    setBusyId(id); setError(null);
    try {
      await api.requestRuleActivation(id);
      toast.info("Activation submitted for approval — a different authorised user must approve it.");
      load();
    } catch (err: any) {
      setError(err.message || "Could not request activation");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetire(id: string) {
    setBusyId(id); setError(null);
    try {
      await api.retireBusinessRule(id);
      load();
    } catch (err: any) {
      setError(err.message || "Could not retire rule");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell active="Business Rules">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Business Rules</h1>
            <p className="text-text-muted text-sm mt-1">doc §41 — institutional policy, configured here, not embedded in code. Currently evaluated at Loan Initiation.</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="btn-dark shrink-0">{showForm ? "Cancel" : "+ New rule"}</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="card p-6 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Rule name</span>
                <input required className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. High-value loans need senior approval" />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Category</span>
                <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </label>
            </div>
            <label className="block mb-4">
              <span className="block text-[13px] text-text-500 mb-1.5">Business purpose (optional)</span>
              <input className="input" value={form.businessPurpose} onChange={(e) => setForm((f) => ({ ...f, businessPurpose: e.target.value }))} />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Trigger point</span>
                <select className="input" value={form.triggerPoint} onChange={(e) => setForm((f) => ({ ...f, triggerPoint: e.target.value }))}>
                  {TRIGGER_POINTS.map((t) => (<option key={t} value={t}>{t.replaceAll("_", " ")}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Condition logic</span>
                <select className="input" value={form.conditionLogic} onChange={(e) => setForm((f) => ({ ...f, conditionLogic: e.target.value }))}>
                  <option value="ALL">ALL conditions must match (AND)</option>
                  <option value="ANY">ANY condition matches (OR)</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Priority (lower runs first)</span>
                <input type="number" className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
              </label>
            </div>

            <span className="block text-[13px] text-text-500 mb-2">Conditions</span>
            {form.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                <input placeholder="field (e.g. principal)" className="input !py-1.5" value={c.field} onChange={(e) => updateCondition(i, "field", e.target.value)} />
                <select className="input !py-1.5" value={c.operator} onChange={(e) => updateCondition(i, "operator", e.target.value)}>
                  {OPERATORS.map((o) => (<option key={o} value={o}>{o.replaceAll("_", " ")}</option>))}
                </select>
                <input placeholder="value" className="input !py-1.5" value={c.value} onChange={(e) => updateCondition(i, "value", e.target.value)} />
              </div>
            ))}
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { ...emptyCondition }] }))} className="btn-text text-gold-600">+ Add condition</button>
              {form.conditions.length > 1 && <button type="button" onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.slice(0, -1) }))} className="btn-text text-rose-600">Remove last</button>}
            </div>

            <span className="block text-[13px] text-text-500 mb-2">Actions (when conditions match)</span>
            {form.actions.map((a, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                <select className="input !py-1.5" value={a.type} onChange={(e) => updateAction(i, "type", e.target.value)}>
                  {ACTION_TYPES.map((t) => (<option key={t} value={t}>{t.replaceAll("_", " ")}</option>))}
                </select>
                <input placeholder="message shown to staff (optional)" className="input !py-1.5" value={a.message} onChange={(e) => updateAction(i, "message", e.target.value)} />
              </div>
            ))}
            <div className="flex gap-2 mb-6">
              <button type="button" onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, { ...emptyAction }] }))} className="btn-text text-gold-600">+ Add action</button>
              {form.actions.length > 1 && <button type="button" onClick={() => setForm((f) => ({ ...f, actions: f.actions.slice(0, -1) }))} className="btn-text text-rose-600">Remove last</button>}
            </div>

            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create rule (as Draft)"}</button>
            <p className="text-text-muted text-xs mt-2">New rules start as Draft — request activation below, which needs a different authorised user to approve before it evaluates against real loans.</p>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm table-modern">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Trigger</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-[12px] text-text-700">{r.ruleCode}</td>
                  <td className="text-text-900 font-medium">{r.name}</td>
                  <td className="text-text-700">{r.category}</td>
                  <td className="text-text-700">{r.triggerPoint.replaceAll("_", " ")}</td>
                  <td className="text-text-700">{r.priority}</td>
                  <td><span className={`badge ${STATUS_COLOR[r.status] || ""}`}>{r.status.replaceAll("_", " ")}</span></td>
                  <td className="whitespace-nowrap space-x-2">
                    {r.status === "DRAFT" && (
                      <button onClick={() => handleRequestActivation(r.id)} disabled={busyId === r.id} className="btn-text text-green-600">Request activation</button>
                    )}
                    {r.status === "ACTIVE" && (
                      <button onClick={() => handleRetire(r.id)} disabled={busyId === r.id} className="btn-text text-rose-600">Retire</button>
                    )}
                  </td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No business rules yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
