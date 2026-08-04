"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

type Tab = "calendars" | "periods" | "grades" | "groups" | "earnings" | "deductions" | "overtime" | "tax";

export default function PayrollPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<Tab>("calendars");
  const [busy, setBusy] = useState(false);

  const [calendars, setCalendars] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
  const [overtimeRules, setOvertimeRules] = useState<any[]>([]);
  const [taxTables, setTaxTables] = useState<any[]>([]);

  const [calForm, setCalForm] = useState({ name: "", frequency: "MONTHLY", payDayOfMonth: "" });
  const [periodForm, setPeriodForm] = useState({ calendarId: "", name: "", startDate: "", endDate: "", payDate: "" });
  const [gradeForm, setGradeForm] = useState({ name: "", minSalary: "", maxSalary: "" });
  const [groupForm, setGroupForm] = useState({ name: "", calendarId: "" });
  const [earningForm, setEarningForm] = useState({ code: "", name: "", category: "ALLOWANCE", taxable: true });
  const [deductionForm, setDeductionForm] = useState({ code: "", name: "", category: "OTHER" });
  const [overtimeForm, setOvertimeForm] = useState({ name: "", multiplier: "" });

  function load() {
    api.listPayrollCalendars().then((r) => setCalendars(r.calendars)).catch((e) => setError(e.message));
    api.listPayrollPeriods().then((r) => setPeriods(r.periods)).catch(() => {});
    api.listSalaryGrades().then((r) => setGrades(r.grades)).catch(() => {});
    api.listPayGroups().then((r) => setGroups(r.groups)).catch(() => {});
    api.listEarningCodes().then((r) => setEarnings(r.codes)).catch(() => {});
    api.listDeductionCodes().then((r) => setDeductions(r.codes)).catch(() => {});
    api.listOvertimeRules().then((r) => setOvertimeRules(r.rules)).catch(() => {});
    api.listTaxTables().then((r) => setTaxTables(r.tables)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function submit(fn: () => Promise<any>, resetFn: () => void, successMsg: string) {
    setBusy(true); setError(null);
    try { await fn(); resetFn(); toast.success(successMsg); load(); }
    catch (err: any) { setError(err.message || "Could not save"); } finally { setBusy(false); }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "calendars", label: "Calendars" }, { id: "periods", label: "Periods" }, { id: "grades", label: "Salary Grades" },
    { id: "groups", label: "Pay Groups" }, { id: "earnings", label: "Earning Codes" }, { id: "deductions", label: "Deduction Codes" },
    { id: "overtime", label: "Overtime Rules" }, { id: "tax", label: "Tax Tables (unconfirmed)" },
  ];

  return (
    <AppShell active="Payroll">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Payroll Configuration</h1>
        <p className="text-text-muted text-sm mb-6">doc §207/§208 — real infrastructure for calendars, periods, grades, and earning/deduction codes. Tax tables and statutory rates (PAYE, SSNIT, Tier 2) are shown but deliberately kept inactive until the current, confirmed GRA/SSNIT rates are provided — nothing computes tax from them yet.</p>

        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => (<button key={t.id} onClick={() => setTab(t.id)} className={`btn-text ${tab === t.id ? "text-gold-600 font-semibold" : "text-text-muted"}`}>{t.label}</button>))}
        </div>

        {tab === "calendars" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createPayrollCalendar({ ...calForm, payDayOfMonth: calForm.payDayOfMonth ? Number(calForm.payDayOfMonth) : undefined }), () => setCalForm({ name: "", frequency: "MONTHLY", payDayOfMonth: "" }), "Calendar created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Name" className="input" value={calForm.name} onChange={(e) => setCalForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="input" value={calForm.frequency} onChange={(e) => setCalForm((f) => ({ ...f, frequency: e.target.value }))}>
                <option value="MONTHLY">Monthly</option><option value="BI_WEEKLY">Bi-Weekly</option><option value="WEEKLY">Weekly</option>
              </select>
              <input type="number" min="1" max="31" placeholder="Pay day of month" className="input !w-40" value={calForm.payDayOfMonth} onChange={(e) => setCalForm((f) => ({ ...f, payDayOfMonth: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Name</th><th>Frequency</th><th>Pay Day</th></tr></thead><tbody>{calendars.map((c: any) => (<tr key={c.id}><td className="text-text-900">{c.name}</td><td className="text-text-700">{c.frequency}</td><td className="text-text-700">{c.payDayOfMonth || "—"}</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "periods" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createPayrollPeriod(periodForm), () => setPeriodForm({ calendarId: "", name: "", startDate: "", endDate: "", payDate: "" }), "Period created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <select required className="input" value={periodForm.calendarId} onChange={(e) => setPeriodForm((f) => ({ ...f, calendarId: e.target.value }))}>
                <option value="">Calendar…</option>
                {calendars.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <input required placeholder="Name (e.g. January 2026)" className="input" value={periodForm.name} onChange={(e) => setPeriodForm((f) => ({ ...f, name: e.target.value }))} />
              <input required type="date" className="input" value={periodForm.startDate} onChange={(e) => setPeriodForm((f) => ({ ...f, startDate: e.target.value }))} />
              <input required type="date" className="input" value={periodForm.endDate} onChange={(e) => setPeriodForm((f) => ({ ...f, endDate: e.target.value }))} />
              <input required type="date" placeholder="Pay date" className="input" value={periodForm.payDate} onChange={(e) => setPeriodForm((f) => ({ ...f, payDate: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Name</th><th>Dates</th><th>Pay Date</th><th>Status</th></tr></thead><tbody>{periods.map((p: any) => (<tr key={p.id}><td className="text-text-900">{p.name}</td><td className="text-text-700 text-[12px]">{new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}</td><td className="text-text-700">{new Date(p.payDate).toLocaleDateString()}</td><td><span className="badge bg-paper-100 text-text-muted">{p.status}</span></td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "grades" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createSalaryGrade({ ...gradeForm, minSalary: Number(gradeForm.minSalary), maxSalary: Number(gradeForm.maxSalary) }), () => setGradeForm({ name: "", minSalary: "", maxSalary: "" }), "Grade created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Grade name" className="input" value={gradeForm.name} onChange={(e) => setGradeForm((f) => ({ ...f, name: e.target.value }))} />
              <input required type="number" placeholder="Min salary" className="input !w-36" value={gradeForm.minSalary} onChange={(e) => setGradeForm((f) => ({ ...f, minSalary: e.target.value }))} />
              <input required type="number" placeholder="Max salary" className="input !w-36" value={gradeForm.maxSalary} onChange={(e) => setGradeForm((f) => ({ ...f, maxSalary: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Grade</th><th>Range</th></tr></thead><tbody>{grades.map((g: any) => (<tr key={g.id}><td className="text-text-900">{g.name}</td><td className="text-text-700">GHS {Number(g.minSalary).toLocaleString()} – {Number(g.maxSalary).toLocaleString()}</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "groups" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createPayGroup(groupForm), () => setGroupForm({ name: "", calendarId: "" }), "Pay group created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Group name" className="input" value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} />
              <select required className="input" value={groupForm.calendarId} onChange={(e) => setGroupForm((f) => ({ ...f, calendarId: e.target.value }))}>
                <option value="">Calendar…</option>
                {calendars.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Group</th></tr></thead><tbody>{groups.map((g: any) => (<tr key={g.id}><td className="text-text-900">{g.name}</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "earnings" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createEarningCode(earningForm), () => setEarningForm({ code: "", name: "", category: "ALLOWANCE", taxable: true }), "Earning code created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Code" className="input !w-28" value={earningForm.code} onChange={(e) => setEarningForm((f) => ({ ...f, code: e.target.value }))} />
              <input required placeholder="Name (e.g. Housing Allowance)" className="input flex-1 min-w-[160px]" value={earningForm.name} onChange={(e) => setEarningForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="input" value={earningForm.category} onChange={(e) => setEarningForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="BASIC">Basic</option><option value="ALLOWANCE">Allowance</option><option value="BONUS">Bonus</option><option value="OVERTIME">Overtime</option><option value="OTHER">Other</option>
              </select>
              <label className="flex items-center gap-1 text-[12px] text-text-700"><input type="checkbox" checked={earningForm.taxable} onChange={(e) => setEarningForm((f) => ({ ...f, taxable: e.target.checked }))} /> Taxable</label>
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Taxable</th></tr></thead><tbody>{earnings.map((c: any) => (<tr key={c.id}><td className="font-mono text-[12px] text-text-700">{c.code}</td><td className="text-text-900">{c.name}</td><td className="text-text-700">{c.category}</td><td className="text-text-700">{c.taxable ? "Yes" : "No"}</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "deductions" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createDeductionCode(deductionForm), () => setDeductionForm({ code: "", name: "", category: "OTHER" }), "Deduction code created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Code" className="input !w-28" value={deductionForm.code} onChange={(e) => setDeductionForm((f) => ({ ...f, code: e.target.value }))} />
              <input required placeholder="Name" className="input flex-1 min-w-[160px]" value={deductionForm.name} onChange={(e) => setDeductionForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="input" value={deductionForm.category} onChange={(e) => setDeductionForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="STATUTORY">Statutory</option><option value="LOAN">Loan</option><option value="INSURANCE">Insurance</option><option value="UNION">Union</option><option value="OTHER">Other</option>
              </select>
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Code</th><th>Name</th><th>Category</th></tr></thead><tbody>{deductions.map((c: any) => (<tr key={c.id}><td className="font-mono text-[12px] text-text-700">{c.code}</td><td className="text-text-900">{c.name}</td><td className="text-text-700">{c.category}</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "overtime" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createOvertimeRule({ ...overtimeForm, multiplier: Number(overtimeForm.multiplier) }), () => setOvertimeForm({ name: "", multiplier: "" }), "Overtime rule created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Name (e.g. Weekday Overtime)" className="input flex-1 min-w-[180px]" value={overtimeForm.name} onChange={(e) => setOvertimeForm((f) => ({ ...f, name: e.target.value }))} />
              <input required type="number" step="0.01" placeholder="Multiplier (e.g. 1.5)" className="input !w-40" value={overtimeForm.multiplier} onChange={(e) => setOvertimeForm((f) => ({ ...f, multiplier: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Name</th><th>Multiplier</th></tr></thead><tbody>{overtimeRules.map((r: any) => (<tr key={r.id}><td className="text-text-900">{r.name}</td><td className="text-text-700">{r.multiplier}x</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "tax" && (
          <div className="card p-5 bg-gold-500/10">
            <div className="font-medium text-[13px] text-ink-900 mb-2">Tax tables and statutory rates are intentionally not editable here yet</div>
            <p className="text-[12.5px] text-text-700 mb-3">Building PAYE/SSNIT/Tier 2 calculation logic requires the current, confirmed GRA and SSNIT rates. Multiple sources checked during this build disagreed on exact band widths, and one flagged an inconsistency in the official GRA table itself — building against unconfirmed figures risks real financial and legal consequences for actual employee pay. This section will be enabled once the rates are confirmed.</p>
            <div className="text-[12.5px] text-text-muted">{taxTables.length} tax table(s) currently on file, all inactive.</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
