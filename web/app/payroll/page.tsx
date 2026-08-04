"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

type Tab = "calendars" | "periods" | "grades" | "groups" | "earnings" | "deductions" | "overtime" | "tax" | "statutory" | "structures" | "process";

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
  const [statutoryRates, setStatutoryRates] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [taxTableForm, setTaxTableForm] = useState({ name: "", effectiveDate: "", bands: [{ lowerBound: "0", upperBound: "", rate: "" }] });
  const [statutoryRateForm, setStatutoryRateForm] = useState({ name: "SSNIT Employee", rate: "", ceiling: "", minimum: "", effectiveDate: "" });
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeStructures, setEmployeeStructures] = useState<any[]>([]);
  const [structureForm, setStructureForm] = useState({
    employeeId: "", payGroupId: "", salaryGradeId: "", basicSalary: "", effectiveDate: "",
    allowances: [] as { earningCodeId: string; amount: string; isPercentageOfBasic: boolean }[],
    deductions: [] as { deductionCodeId: string; amount: string; isPercentageOfBasic: boolean }[],
  });

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
    api.listStatutoryRates().then((r) => setStatutoryRates(r.rates)).catch(() => {});
    api.listPayrollRuns().then((r) => setRuns(r.runs)).catch(() => {});
  }

  async function handleActivateTax(id: string) {
    setBusy(true); setError(null);
    try { await api.activateTaxTable(id); toast.success("Tax table activated."); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleActivateStatutory(id: string) {
    setBusy(true); setError(null);
    try { await api.activateStatutoryRate(id); toast.success("Rate activated."); load(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleProcess(periodId: string) {
    setBusy(true); setError(null);
    try { const res = await api.processPayrollPeriod(periodId); toast.success(`Processed ${res.run.entries.length} employee(s).`); load(); }
    catch (err: any) { setError(err.message || "Could not process payroll"); } finally { setBusy(false); }
  }

  async function viewRun(id: string) {
    try { const res = await api.getPayrollRun(id); setSelectedRun(res.run); } catch (err: any) { setError(err.message); }
  }

  function updateBandRow(i: number, key: string, value: string) {
    setTaxTableForm((f) => { const bands = [...f.bands]; bands[i] = { ...bands[i], [key]: value }; return { ...f, bands }; });
  }
  function addBandRow() {
    setTaxTableForm((f) => {
      // A new row's lower bound defaults to the previous row's upper
      // bound, since bands are meant to sit end-to-end with no gaps.
      const lastUpper = f.bands[f.bands.length - 1]?.upperBound || "";
      return { ...f, bands: [...f.bands, { lowerBound: lastUpper, upperBound: "", rate: "" }] };
    });
  }
  function removeBandRow(i: number) {
    setTaxTableForm((f) => ({ ...f, bands: f.bands.filter((_, idx) => idx !== i) }));
  }

  async function handleCreateTaxTable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const bands = taxTableForm.bands.map((b, i) => ({
        sequence: i + 1, lowerBound: Number(b.lowerBound),
        upperBound: b.upperBound ? Number(b.upperBound) : undefined, // blank = open-ended top band
        rate: Number(b.rate),
      }));
      await api.createTaxTable({ name: taxTableForm.name, effectiveDate: taxTableForm.effectiveDate, bands });
      toast.success("Tax table created. Activate it from the list below when ready.");
      setTaxTableForm({ name: "", effectiveDate: "", bands: [{ lowerBound: "0", upperBound: "", rate: "" }] });
      load();
    } catch (err: any) { setError(err.message || "Could not create tax table"); } finally { setBusy(false); }
  }

  async function handleCreateStatutoryRate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createStatutoryRate({
        name: statutoryRateForm.name, rate: Number(statutoryRateForm.rate),
        ceiling: statutoryRateForm.ceiling ? Number(statutoryRateForm.ceiling) : undefined,
        minimum: statutoryRateForm.minimum ? Number(statutoryRateForm.minimum) : undefined,
        effectiveDate: statutoryRateForm.effectiveDate,
      });
      toast.success("Statutory rate created. Activate it from the list below when ready.");
      setStatutoryRateForm({ name: "SSNIT Employee", rate: "", ceiling: "", minimum: "", effectiveDate: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not create statutory rate"); } finally { setBusy(false); }
  }

  function addAllowanceRow() {
    setStructureForm((f) => ({ ...f, allowances: [...f.allowances, { earningCodeId: "", amount: "", isPercentageOfBasic: false }] }));
  }
  function updateAllowanceRow(i: number, key: string, value: any) {
    setStructureForm((f) => { const allowances = [...f.allowances]; allowances[i] = { ...allowances[i], [key]: value }; return { ...f, allowances }; });
  }
  function removeAllowanceRow(i: number) {
    setStructureForm((f) => ({ ...f, allowances: f.allowances.filter((_, idx) => idx !== i) }));
  }
  function addDeductionRow() {
    setStructureForm((f) => ({ ...f, deductions: [...f.deductions, { deductionCodeId: "", amount: "", isPercentageOfBasic: false }] }));
  }
  function updateDeductionRow(i: number, key: string, value: any) {
    setStructureForm((f) => { const deductions = [...f.deductions]; deductions[i] = { ...deductions[i], [key]: value }; return { ...f, deductions }; });
  }
  function removeDeductionRow(i: number) {
    setStructureForm((f) => ({ ...f, deductions: f.deductions.filter((_, idx) => idx !== i) }));
  }

  async function handleCreateStructure(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.createSalaryStructure({
        employeeId: structureForm.employeeId,
        payGroupId: structureForm.payGroupId || undefined,
        salaryGradeId: structureForm.salaryGradeId || undefined,
        basicSalary: Number(structureForm.basicSalary),
        effectiveDate: structureForm.effectiveDate,
        allowances: structureForm.allowances.map((a) => ({ earningCodeId: a.earningCodeId, amount: Number(a.amount), isPercentageOfBasic: a.isPercentageOfBasic })),
        deductions: structureForm.deductions.map((d) => ({ deductionCodeId: d.deductionCodeId, amount: Number(d.amount), isPercentageOfBasic: d.isPercentageOfBasic })),
      });
      toast.success("Salary structure created as DRAFT. Request approval to activate it.");
      setStructureForm({ employeeId: "", payGroupId: "", salaryGradeId: "", basicSalary: "", effectiveDate: "", allowances: [], deductions: [] });
      if (structureForm.employeeId) loadEmployeeStructures(structureForm.employeeId);
    } catch (err: any) { setError(err.message || "Could not create salary structure"); } finally { setBusy(false); }
  }

  async function loadEmployeeStructures(employeeId: string) {
    if (!employeeId) { setEmployeeStructures([]); return; }
    try { const res = await api.getEmployeeSalaryStructures(employeeId); setEmployeeStructures(res.structures); } catch { setEmployeeStructures([]); }
  }

  async function handleRequestStructureApproval(id: string) {
    setBusy(true); setError(null);
    try { await api.requestSalaryStructureApproval(id); toast.info("Submitted for approval."); loadEmployeeStructures(structureForm.employeeId); }
    catch (err: any) { setError(err.message || "Could not request approval"); } finally { setBusy(false); }
  }

  useEffect(() => { load(); api.listEmployees().then((r: any) => setEmployees(r.employees)).catch(() => {}); }, []);

  async function submit(fn: () => Promise<any>, resetFn: () => void, successMsg: string) {
    setBusy(true); setError(null);
    try { await fn(); resetFn(); toast.success(successMsg); load(); }
    catch (err: any) { setError(err.message || "Could not save"); } finally { setBusy(false); }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "calendars", label: "Calendars" }, { id: "periods", label: "Periods" }, { id: "grades", label: "Salary Grades" },
    { id: "groups", label: "Pay Groups" }, { id: "earnings", label: "Earning Codes" }, { id: "deductions", label: "Deduction Codes" },
    { id: "overtime", label: "Overtime Rules" }, { id: "tax", label: "Tax Tables" },
    { id: "statutory", label: "Statutory Rates" }, { id: "structures", label: "Salary Structures" }, { id: "process", label: "Process Payroll" },
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
          <>
            <p className="text-[12.5px] text-text-muted mb-4">Confirmed against the GRA's own published cumulative-tax figures and tested exactly before this went live. Only ONE tax table can be active at a time — activating a new one deactivates whichever was active before. When GRA revises the bands (as they do periodically), create a new table below rather than editing an old one — the previous table stays on file for historical reference.</p>

            <form onSubmit={handleCreateTaxTable} className="card p-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input required placeholder="Name (e.g. GRA PAYE 2027)" className="input" value={taxTableForm.name} onChange={(e) => setTaxTableForm((f) => ({ ...f, name: e.target.value }))} />
                <input required type="date" className="input" value={taxTableForm.effectiveDate} onChange={(e) => setTaxTableForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
              </div>
              <div className="text-[11px] text-text-muted mb-2">Leave the last row's upper bound blank for the open-ended top band.</div>
              {taxTableForm.bands.map((b, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                  <input required type="number" step="0.01" placeholder="Lower bound" className="input !py-1.5" value={b.lowerBound} onChange={(e) => updateBandRow(i, "lowerBound", e.target.value)} />
                  <input type="number" step="0.01" placeholder="Upper bound (blank = open)" className="input !py-1.5" value={b.upperBound} onChange={(e) => updateBandRow(i, "upperBound", e.target.value)} />
                  <input required type="number" step="0.01" placeholder="Rate %" className="input !py-1.5" value={b.rate} onChange={(e) => updateBandRow(i, "rate", e.target.value)} />
                  {taxTableForm.bands.length > 1 && <button type="button" onClick={() => removeBandRow(i)} className="btn-text text-rose-600 !text-[11px]">Remove</button>}
                </div>
              ))}
              <div className="flex gap-2 mb-3 mt-2">
                <button type="button" onClick={addBandRow} className="btn-text text-gold-600">+ Add band</button>
              </div>
              <button type="submit" disabled={busy} className="btn-primary">Create Tax Table</button>
            </form>

            <div className="space-y-3">
              {taxTables.map((t: any) => (
                <div key={t.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-[13px] text-ink-900">{t.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${t.active ? "bg-green-100 text-green-600" : "bg-paper-100 text-text-muted"}`}>{t.active ? "ACTIVE" : "Inactive"}</span>
                      {!t.active && <button onClick={() => handleActivateTax(t.id)} className="btn-text text-gold-600">Activate</button>}
                    </div>
                  </div>
                  <table className="w-full text-[12px]"><tbody>
                    {t.bands.map((b: any) => (<tr key={b.id}><td className="text-text-700 py-0.5">GHS {Number(b.lowerBound).toLocaleString()} – {b.upperBound ? `GHS ${Number(b.upperBound).toLocaleString()}` : "and above"}</td><td className="text-text-900 text-right">{b.rate}%</td></tr>))}
                  </tbody></table>
                </div>
              ))}
              {taxTables.length === 0 && <p className="text-text-muted text-sm text-center py-8">No tax tables created yet.</p>}
            </div>
          </>
        )}

        {tab === "statutory" && (
          <>
            <p className="text-[12.5px] text-text-muted mb-4">Confirmed 2026 rates: SSNIT Employee 5.5%, SSNIT Employer (Tier 1) 8%, Tier 2 Employer 5% — combined employer 13%, combined total 18.5%. Ceiling GHS 69,000/month, minimum GHS 587.79/month. Names must be exactly "SSNIT Employee", "SSNIT Employer Tier 1", "Tier 2 Employer" for payroll processing to find them. When SSNIT revises the ceiling (they do this annually, per their own published notices), create a new rate below rather than editing the old one.</p>

            <form onSubmit={handleCreateStatutoryRate} className="card p-4 mb-6 flex flex-wrap items-end gap-3">
              <select className="input" value={statutoryRateForm.name} onChange={(e) => setStatutoryRateForm((f) => ({ ...f, name: e.target.value }))}>
                <option value="SSNIT Employee">SSNIT Employee</option>
                <option value="SSNIT Employer Tier 1">SSNIT Employer Tier 1</option>
                <option value="Tier 2 Employer">Tier 2 Employer</option>
              </select>
              <input required type="number" step="0.01" placeholder="Rate %" className="input !w-28" value={statutoryRateForm.rate} onChange={(e) => setStatutoryRateForm((f) => ({ ...f, rate: e.target.value }))} />
              <input type="number" step="0.01" placeholder="Ceiling (GHS)" className="input !w-36" value={statutoryRateForm.ceiling} onChange={(e) => setStatutoryRateForm((f) => ({ ...f, ceiling: e.target.value }))} />
              <input type="number" step="0.01" placeholder="Minimum (GHS)" className="input !w-36" value={statutoryRateForm.minimum} onChange={(e) => setStatutoryRateForm((f) => ({ ...f, minimum: e.target.value }))} />
              <input required type="date" className="input" value={statutoryRateForm.effectiveDate} onChange={(e) => setStatutoryRateForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>

            <div className="card overflow-x-auto">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Name</th><th>Rate</th><th>Ceiling</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {statutoryRates.map((r: any) => (
                    <tr key={r.id}>
                      <td className="text-text-900">{r.name}</td>
                      <td className="text-text-700">{r.rate}%</td>
                      <td className="text-text-700">{r.ceiling ? `GHS ${Number(r.ceiling).toLocaleString()}` : "—"}</td>
                      <td><span className={`badge ${r.active ? "bg-green-100 text-green-600" : "bg-paper-100 text-text-muted"}`}>{r.active ? "ACTIVE" : "Inactive"}</span></td>
                      <td>{!r.active && <button onClick={() => handleActivateStatutory(r.id)} className="btn-text text-gold-600">Activate</button>}</td>
                    </tr>
                  ))}
                  {statutoryRates.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No statutory rates created yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "structures" && (
          <>
            <form onSubmit={handleCreateStructure} className="card p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <select required className="input" value={structureForm.employeeId} onChange={(e) => { setStructureForm((f) => ({ ...f, employeeId: e.target.value })); loadEmployeeStructures(e.target.value); }}>
                  <option value="">Employee…</option>
                  {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
                </select>
                <input required type="date" className="input" value={structureForm.effectiveDate} onChange={(e) => setStructureForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
                <input required type="number" step="0.01" placeholder="Basic salary" className="input" value={structureForm.basicSalary} onChange={(e) => setStructureForm((f) => ({ ...f, basicSalary: e.target.value }))} />
                <select className="input" value={structureForm.salaryGradeId} onChange={(e) => setStructureForm((f) => ({ ...f, salaryGradeId: e.target.value }))}>
                  <option value="">Salary grade (optional)…</option>
                  {grades.map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                </select>
                <select className="input" value={structureForm.payGroupId} onChange={(e) => setStructureForm((f) => ({ ...f, payGroupId: e.target.value }))}>
                  <option value="">Pay group (optional)…</option>
                  {groups.map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                </select>
              </div>

              <div className="font-medium text-[12.5px] text-text-900 mb-2 mt-4">Allowances</div>
              {structureForm.allowances.map((a, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                  <select required className="input !py-1.5" value={a.earningCodeId} onChange={(e) => updateAllowanceRow(i, "earningCodeId", e.target.value)}>
                    <option value="">Earning code…</option>
                    {earnings.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <input required type="number" step="0.01" placeholder="Amount" className="input !py-1.5" value={a.amount} onChange={(e) => updateAllowanceRow(i, "amount", e.target.value)} />
                  <label className="flex items-center gap-1 text-[11px] text-text-700"><input type="checkbox" checked={a.isPercentageOfBasic} onChange={(e) => updateAllowanceRow(i, "isPercentageOfBasic", e.target.checked)} /> % of basic</label>
                  <button type="button" onClick={() => removeAllowanceRow(i)} className="btn-text text-rose-600 !text-[11px]">Remove</button>
                </div>
              ))}
              <button type="button" onClick={addAllowanceRow} className="btn-text text-gold-600 mb-3">+ Add allowance</button>

              <div className="font-medium text-[12.5px] text-text-900 mb-2 mt-2">Deductions</div>
              {structureForm.deductions.map((d, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                  <select required className="input !py-1.5" value={d.deductionCodeId} onChange={(e) => updateDeductionRow(i, "deductionCodeId", e.target.value)}>
                    <option value="">Deduction code…</option>
                    {deductions.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <input required type="number" step="0.01" placeholder="Amount" className="input !py-1.5" value={d.amount} onChange={(e) => updateDeductionRow(i, "amount", e.target.value)} />
                  <label className="flex items-center gap-1 text-[11px] text-text-700"><input type="checkbox" checked={d.isPercentageOfBasic} onChange={(e) => updateDeductionRow(i, "isPercentageOfBasic", e.target.checked)} /> % of basic</label>
                  <button type="button" onClick={() => removeDeductionRow(i)} className="btn-text text-rose-600 !text-[11px]">Remove</button>
                </div>
              ))}
              <button type="button" onClick={addDeductionRow} className="btn-text text-gold-600 mb-3">+ Add deduction</button>

              <div>
                <button type="submit" disabled={busy} className="btn-primary">Create Salary Structure</button>
              </div>
            </form>

            {structureForm.employeeId && (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm table-modern">
                  <thead><tr><th>Effective</th><th>Basic</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {employeeStructures.map((s: any) => (
                      <tr key={s.id}>
                        <td className="text-text-700">{new Date(s.effectiveDate).toLocaleDateString()}</td>
                        <td className="text-text-700">GHS {Number(s.basicSalary).toLocaleString()}</td>
                        <td><span className={`badge ${s.status === "ACTIVE" ? "bg-green-100 text-green-600" : s.status === "PENDING_APPROVAL" ? "bg-gold-500/15 text-gold-600" : "bg-paper-100 text-text-muted"}`}>{s.status.replaceAll("_", " ")}</span></td>
                        <td>{s.status === "DRAFT" && <button onClick={() => handleRequestStructureApproval(s.id)} className="btn-text text-gold-600">Request approval</button>}</td>
                      </tr>
                    ))}
                    {employeeStructures.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-6">No salary structures for this employee yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "process" && (
          <>
            <div className="card overflow-x-auto mb-6">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Period</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {periods.map((p: any) => (
                    <tr key={p.id}>
                      <td className="text-text-900">{p.name}</td>
                      <td><span className="badge bg-paper-100 text-text-muted">{p.status}</span></td>
                      <td>{p.status === "OPEN" && <button onClick={() => handleProcess(p.id)} disabled={busy} className="btn-text text-gold-600">Process</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Payroll Runs</h2>
            <div className="card overflow-x-auto mb-6">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Processed</th><th>Employees</th><th>Gross</th><th>Deductions</th><th>Net</th><th></th></tr></thead>
                <tbody>
                  {runs.map((r: any) => (
                    <tr key={r.id}>
                      <td className="text-text-700">{r.processedAt ? new Date(r.processedAt).toLocaleString() : "—"}</td>
                      <td className="text-text-700">{r.entries?.length ?? "—"}</td>
                      <td className="text-text-700">GHS {Number(r.totalGross).toLocaleString()}</td>
                      <td className="text-text-700">GHS {Number(r.totalDeductions).toLocaleString()}</td>
                      <td className="text-text-900 font-medium">GHS {Number(r.totalNet).toLocaleString()}</td>
                      <td><button onClick={() => viewRun(r.id)} className="btn-text text-gold-600">View</button></td>
                    </tr>
                  ))}
                  {runs.length === 0 && <tr><td colSpan={6} className="text-center text-text-muted text-sm py-8">No payroll runs yet.</td></tr>}
                </tbody>
              </table>
            </div>

            {selectedRun && (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm table-modern">
                  <thead><tr><th>Employee</th><th>Basic</th><th>Gross</th><th>PAYE</th><th>SSNIT (Emp)</th><th>Net</th></tr></thead>
                  <tbody>
                    {selectedRun.entries.map((e: any) => (
                      <tr key={e.id}>
                        <td className="text-text-900">{e.employeeId}</td>
                        <td className="text-text-700">GHS {Number(e.basicSalary).toLocaleString()}</td>
                        <td className="text-text-700">GHS {Number(e.grossPay).toLocaleString()}</td>
                        <td className="text-text-700">GHS {Number(e.paye).toLocaleString()}</td>
                        <td className="text-text-700">GHS {Number(e.ssnitEmployee).toLocaleString()}</td>
                        <td className="text-text-900 font-medium">GHS {Number(e.netPay).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
