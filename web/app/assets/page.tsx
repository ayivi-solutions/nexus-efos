"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";
import { CodeScanner } from "@/components/CodeScanner";
import { useGeolocation } from "@/lib/useGeolocation";

type Tab = "categories" | "register" | "list" | "allocate" | "transfer" | "maintenance" | "depreciation" | "disposal" | "verify" | "accounting" | "reports";

export default function AssetsPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<Tab>("list");
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [glMappings, setGlMappings] = useState<any>({ mappings: [], purposes: [], accounts: [] });
  const [reportRegister, setReportRegister] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [lifecycle, setLifecycle] = useState<any[]>([]);
  const [overdueMaintenance, setOverdueMaintenance] = useState<any[]>([]);
  const [byBranchReport, setByBranchReport] = useState<any[]>([]);
  const [showScanner, setShowScanner] = useState(false);

  const [categoryForm, setCategoryForm] = useState({ name: "", defaultUsefulLifeMonths: "", defaultDepreciationMethod: "STRAIGHT_LINE", defaultDepreciationRate: "" });
  const [assetForm, setAssetForm] = useState({ assetCode: "", name: "", categoryId: "", serialNumber: "", manufacturer: "", model: "", acquisitionDate: "", acquisitionCost: "", supplierName: "", usefulLifeMonths: "", residualValue: "0", barcodeValue: "", qrCodeValue: "" });
  const [allocateForm, setAllocateForm] = useState({ assetId: "", employeeId: "", departmentId: "", branchId: "", notes: "" });
  const [transferForm, setTransferForm] = useState({ assetId: "", toEmployeeId: "", toDepartmentId: "", toBranchId: "", reason: "" });
  const [scheduleForm, setScheduleForm] = useState({ assetId: "", frequencyMonths: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({ assetId: "", type: "PREVENTIVE", completedDate: "", serviceProvider: "", cost: "", notes: "" });
  const [depreciationForm, setDepreciationForm] = useState({ assetId: "", periodLabel: "" });
  const [disposalForm, setDisposalForm] = useState({ assetId: "", disposalType: "SALE", disposalDate: "", saleProceeds: "", reason: "" });
  const [verifyForm, setVerifyForm] = useState({ assetId: "", locationConfirmed: true, custodianConfirmed: true, condition: "GOOD", notes: "" });
  const [mappingForm, setMappingForm] = useState({ purpose: "", glAccountId: "" });

  const geo = useGeolocation();

  function load() {
    api.listAssetCategories().then((r) => setCategories(r.categories)).catch((e) => setError(e.message));
    api.listAssets().then((r) => setAssets(r.assets)).catch(() => {});
    api.listEmployees().then((r: any) => setEmployees(r.employees)).catch(() => {});
    api.listBranches().then((r: any) => setBranches(r.branches)).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "accounting") api.listAssetGLMappings().then(setGlMappings).catch(() => {}); }, [tab]);
  useEffect(() => {
    if (tab === "reports") {
      api.getAssetRegisterReport().then((r) => setReportRegister(r.assets)).catch(() => {});
      api.getAssetValuationReport().then(setValuation).catch(() => {});
      api.getAssetLifecycleReport().then((r) => setLifecycle(r.assets)).catch(() => {});
      api.getOverdueMaintenanceReport().then((r) => setOverdueMaintenance(r.overdue)).catch(() => {});
      api.getAssetsByBranchReport().then((r) => setByBranchReport(r.branches)).catch(() => {});
    }
  }, [tab]);

  async function submit(fn: () => Promise<any>, resetFn: () => void, successMsg: string) {
    setBusy(true); setError(null);
    try { await fn(); resetFn(); toast.success(successMsg); load(); }
    catch (err: any) { setError(err.message || "Could not save"); } finally { setBusy(false); }
  }

  async function viewAsset(id: string) {
    try { const res = await api.getAsset(id); setSelectedAsset(res.asset); } catch (err: any) { setError(err.message); }
  }

  function handleScanResult(code: string) {
    setShowScanner(false);
    api.lookupAssetByCode(code).then((r) => { setSelectedAsset(r.asset); setTab("verify"); setVerifyForm((f) => ({ ...f, assetId: r.asset.id })); toast.success(`Found: ${r.asset.name}`); })
      .catch(() => setError(`No asset found matching code "${code}"`));
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "list", label: "Asset Register" }, { id: "categories", label: "Categories" }, { id: "register", label: "Register Asset" },
    { id: "allocate", label: "Allocate" }, { id: "transfer", label: "Transfer" }, { id: "maintenance", label: "Maintenance" },
    { id: "depreciation", label: "Depreciation" }, { id: "disposal", label: "Disposal" }, { id: "verify", label: "Verify" },
    { id: "accounting", label: "GL Mapping" }, { id: "reports", label: "Reports" },
  ];

  return (
    <AppShell active="Assets">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Asset Management</h1>
          <button onClick={() => setShowScanner(true)} className="btn-primary">📷 Scan Asset</button>
        </div>
        <p className="text-text-muted text-sm mb-6">doc §186-195 — real camera-based QR/barcode scanning and GPS capture, not just stored code values.</p>

        {showScanner && <CodeScanner onDetected={handleScanResult} onClose={() => setShowScanner(false)} />}

        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => (<button key={t.id} onClick={() => setTab(t.id)} className={`btn-text ${tab === t.id ? "text-gold-600 font-semibold" : "text-text-muted"}`}>{t.label}</button>))}
        </div>

        {tab === "categories" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createAssetCategory({ ...categoryForm, defaultUsefulLifeMonths: Number(categoryForm.defaultUsefulLifeMonths), defaultDepreciationRate: categoryForm.defaultDepreciationRate ? Number(categoryForm.defaultDepreciationRate) : undefined }), () => setCategoryForm({ name: "", defaultUsefulLifeMonths: "", defaultDepreciationMethod: "STRAIGHT_LINE", defaultDepreciationRate: "" }), "Category created."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <input required placeholder="Category name" className="input" value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} />
              <input required type="number" placeholder="Useful life (months)" className="input !w-44" value={categoryForm.defaultUsefulLifeMonths} onChange={(e) => setCategoryForm((f) => ({ ...f, defaultUsefulLifeMonths: e.target.value }))} />
              <select className="input" value={categoryForm.defaultDepreciationMethod} onChange={(e) => setCategoryForm((f) => ({ ...f, defaultDepreciationMethod: e.target.value }))}>
                <option value="STRAIGHT_LINE">Straight-Line</option><option value="REDUCING_BALANCE">Reducing Balance</option>
              </select>
              {categoryForm.defaultDepreciationMethod === "REDUCING_BALANCE" && <input required type="number" step="0.01" placeholder="Annual rate %" className="input !w-32" value={categoryForm.defaultDepreciationRate} onChange={(e) => setCategoryForm((f) => ({ ...f, defaultDepreciationRate: e.target.value }))} />}
              <button type="submit" disabled={busy} className="btn-primary">Create</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Name</th><th>Useful Life</th><th>Method</th><th>Rate</th></tr></thead><tbody>{categories.map((c: any) => (<tr key={c.id}><td className="text-text-900">{c.name}</td><td className="text-text-700">{c.defaultUsefulLifeMonths} mo</td><td className="text-text-700">{c.defaultDepreciationMethod.replaceAll("_", " ")}</td><td className="text-text-700">{c.defaultDepreciationRate ? `${c.defaultDepreciationRate}%` : "—"}</td></tr>))}</tbody></table></div>
          </>
        )}

        {tab === "register" && (
          <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createAsset({ ...assetForm, acquisitionCost: Number(assetForm.acquisitionCost), usefulLifeMonths: Number(assetForm.usefulLifeMonths), residualValue: Number(assetForm.residualValue), latitude: geo.coords?.latitude, longitude: geo.coords?.longitude }), () => setAssetForm({ assetCode: "", name: "", categoryId: "", serialNumber: "", manufacturer: "", model: "", acquisitionDate: "", acquisitionCost: "", supplierName: "", usefulLifeMonths: "", residualValue: "0", barcodeValue: "", qrCodeValue: "" }), "Asset registered."); }} className="card p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input required placeholder="Asset code" className="input" value={assetForm.assetCode} onChange={(e) => setAssetForm((f) => ({ ...f, assetCode: e.target.value }))} />
              <input required placeholder="Name" className="input" value={assetForm.name} onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))} />
              <select required className="input" value={assetForm.categoryId} onChange={(e) => setAssetForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Category…</option>
                {categories.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <input placeholder="Serial number" className="input" value={assetForm.serialNumber} onChange={(e) => setAssetForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              <input placeholder="Manufacturer" className="input" value={assetForm.manufacturer} onChange={(e) => setAssetForm((f) => ({ ...f, manufacturer: e.target.value }))} />
              <input placeholder="Model" className="input" value={assetForm.model} onChange={(e) => setAssetForm((f) => ({ ...f, model: e.target.value }))} />
              <input required type="date" className="input" value={assetForm.acquisitionDate} onChange={(e) => setAssetForm((f) => ({ ...f, acquisitionDate: e.target.value }))} />
              <input required type="number" step="0.01" placeholder="Acquisition cost" className="input" value={assetForm.acquisitionCost} onChange={(e) => setAssetForm((f) => ({ ...f, acquisitionCost: e.target.value }))} />
              <input placeholder="Supplier" className="input" value={assetForm.supplierName} onChange={(e) => setAssetForm((f) => ({ ...f, supplierName: e.target.value }))} />
              <input required type="number" placeholder="Useful life (months)" className="input" value={assetForm.usefulLifeMonths} onChange={(e) => setAssetForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))} />
              <input required type="number" step="0.01" placeholder="Residual value" className="input" value={assetForm.residualValue} onChange={(e) => setAssetForm((f) => ({ ...f, residualValue: e.target.value }))} />
              <input placeholder="Barcode value" className="input" value={assetForm.barcodeValue} onChange={(e) => setAssetForm((f) => ({ ...f, barcodeValue: e.target.value }))} />
              <input placeholder="QR code value" className="input" value={assetForm.qrCodeValue} onChange={(e) => setAssetForm((f) => ({ ...f, qrCodeValue: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={geo.capture} disabled={geo.capturing} className="btn-text text-gold-600">{geo.capturing ? "Capturing…" : "📍 Capture GPS Location"}</button>
              {geo.coords && <span className="text-[12px] text-text-700">{geo.coords.latitude.toFixed(5)}, {geo.coords.longitude.toFixed(5)}</span>}
              {geo.error && <span className="text-[12px] text-rose-600">{geo.error}</span>}
            </div>
            <button type="submit" disabled={busy} className="btn-primary">Register Asset</button>
          </form>
        )}

        {tab === "list" && (
          <>
            {!selectedAsset ? (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm table-modern">
                  <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Cost</th><th>NBV</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {assets.map((a: any) => (
                      <tr key={a.id}>
                        <td className="font-mono text-[12px] text-text-700">{a.assetCode}</td>
                        <td className="text-text-900">{a.name}</td>
                        <td className="text-text-700">{a.category?.name}</td>
                        <td className="text-text-700">GHS {Number(a.acquisitionCost).toLocaleString()}</td>
                        <td className="text-text-700">GHS {(Number(a.acquisitionCost) - Number(a.accumulatedDepreciation)).toLocaleString()}</td>
                        <td><span className={`badge ${a.status === "ACTIVE" ? "bg-green-100 text-green-600" : a.status === "DISPOSED" ? "bg-paper-100 text-text-muted" : "bg-rose-100 text-rose-600"}`}>{a.status.replaceAll("_", " ")}</span></td>
                        <td><button onClick={() => viewAsset(a.id)} className="btn-text text-gold-600">View</button></td>
                      </tr>
                    ))}
                    {assets.length === 0 && <tr><td colSpan={7} className="text-center text-text-muted text-sm py-8">No assets registered yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card p-5">
                <button onClick={() => setSelectedAsset(null)} className="btn-text text-gold-600 mb-3">← Back to list</button>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-1">{selectedAsset.name} ({selectedAsset.assetCode})</h2>
                <p className="text-[12.5px] text-text-muted mb-4">{selectedAsset.category?.name} · {selectedAsset.status}</p>
                <div className="grid grid-cols-2 dt:grid-cols-4 gap-3 mb-6">
                  <div><div className="text-[10.5px] text-text-muted uppercase">Acquisition Cost</div><div className="text-text-900 font-medium">GHS {Number(selectedAsset.acquisitionCost).toLocaleString()}</div></div>
                  <div><div className="text-[10.5px] text-text-muted uppercase">Accumulated Depreciation</div><div className="text-text-900 font-medium">GHS {Number(selectedAsset.accumulatedDepreciation).toLocaleString()}</div></div>
                  <div><div className="text-[10.5px] text-text-muted uppercase">Net Book Value</div><div className="text-text-900 font-medium">GHS {(Number(selectedAsset.acquisitionCost) - Number(selectedAsset.accumulatedDepreciation)).toLocaleString()}</div></div>
                  <div><div className="text-[10.5px] text-text-muted uppercase">Useful Life</div><div className="text-text-900 font-medium">{selectedAsset.usefulLifeMonths} months</div></div>
                </div>
                <h3 className="font-medium text-[13px] text-text-900 mb-2">Depreciation History</h3>
                <table className="w-full text-sm table-modern mb-4"><thead><tr><th>Period</th><th>Amount</th><th>Accumulated</th><th>NBV</th></tr></thead><tbody>
                  {selectedAsset.depreciationEntries.map((e: any) => (<tr key={e.id}><td className="text-text-700">{e.periodLabel}</td><td className="text-text-700">GHS {Number(e.depreciationAmount).toLocaleString()}</td><td className="text-text-700">GHS {Number(e.accumulatedDepreciation).toLocaleString()}</td><td className="text-text-700">GHS {Number(e.netBookValue).toLocaleString()}</td></tr>))}
                  {selectedAsset.depreciationEntries.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-4">No depreciation posted yet.</td></tr>}
                </tbody></table>
                <h3 className="font-medium text-[13px] text-text-900 mb-2">Verification History</h3>
                <table className="w-full text-sm table-modern"><thead><tr><th>Date</th><th>Condition</th><th>Variance</th></tr></thead><tbody>
                  {selectedAsset.verificationRecords.map((v: any) => (<tr key={v.id}><td className="text-text-700">{new Date(v.verifiedAt).toLocaleDateString()}</td><td className="text-text-700">{v.condition}</td><td>{v.variance ? <span className="text-rose-600">Yes</span> : <span className="text-green-600">No</span>}</td></tr>))}
                  {selectedAsset.verificationRecords.length === 0 && <tr><td colSpan={3} className="text-center text-text-muted text-sm py-4">Not yet verified.</td></tr>}
                </tbody></table>
              </div>
            )}
          </>
        )}
        {tab === "allocate" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createAssetAllocation(allocateForm), () => setAllocateForm({ assetId: "", employeeId: "", departmentId: "", branchId: "", notes: "" }), "Asset allocated."); }} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
              <select required className="input" value={allocateForm.assetId} onChange={(e) => setAllocateForm((f) => ({ ...f, assetId: e.target.value }))}>
                <option value="">Asset…</option>
                {assets.filter((a: any) => a.status === "ACTIVE").map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>))}
              </select>
              <select className="input" value={allocateForm.employeeId} onChange={(e) => setAllocateForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Employee (optional)…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <select className="input" value={allocateForm.branchId} onChange={(e) => setAllocateForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Branch (optional)…</option>
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
              <input placeholder="Notes" className="input flex-1 min-w-[160px]" value={allocateForm.notes} onChange={(e) => setAllocateForm((f) => ({ ...f, notes: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Allocate</button>
            </form>
            <p className="text-[12.5px] text-text-muted">Allocations return via the asset's detail page — return with a condition note when the asset comes back.</p>
          </>
        )}

        {tab === "transfer" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createAssetTransfer(transferForm), () => setTransferForm({ assetId: "", toEmployeeId: "", toDepartmentId: "", toBranchId: "", reason: "" }), "Transfer submitted for approval."); }} className="card p-4 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={transferForm.assetId} onChange={(e) => setTransferForm((f) => ({ ...f, assetId: e.target.value }))}>
                <option value="">Asset…</option>
                {assets.filter((a: any) => a.status !== "DISPOSED").map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>))}
              </select>
              <select className="input" value={transferForm.toEmployeeId} onChange={(e) => setTransferForm((f) => ({ ...f, toEmployeeId: e.target.value }))}>
                <option value="">To employee…</option>
                {employees.map((e: any) => (<option key={e.id} value={e.id}>{e.fullName}</option>))}
              </select>
              <select className="input" value={transferForm.toBranchId} onChange={(e) => setTransferForm((f) => ({ ...f, toBranchId: e.target.value }))}>
                <option value="">To branch…</option>
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
              <input required placeholder="Reason" className="input flex-1 min-w-[160px]" value={transferForm.reason} onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Request Transfer</button>
            </form>
          </>
        )}

        {tab === "maintenance" && (
          <>
            <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-6">
              <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createMaintenanceSchedule({ ...scheduleForm, frequencyMonths: Number(scheduleForm.frequencyMonths) }), () => setScheduleForm({ assetId: "", frequencyMonths: "" }), "Schedule set."); }} className="card p-4 flex flex-wrap items-end gap-3">
                <select required className="input" value={scheduleForm.assetId} onChange={(e) => setScheduleForm((f) => ({ ...f, assetId: e.target.value }))}>
                  <option value="">Asset…</option>
                  {assets.map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode}</option>))}
                </select>
                <input required type="number" placeholder="Every N months" className="input !w-36" value={scheduleForm.frequencyMonths} onChange={(e) => setScheduleForm((f) => ({ ...f, frequencyMonths: e.target.value }))} />
                <button type="submit" disabled={busy} className="btn-primary">Set Schedule</button>
              </form>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createMaintenanceRecord({ ...maintenanceForm, cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined }), () => setMaintenanceForm({ assetId: "", type: "PREVENTIVE", completedDate: "", serviceProvider: "", cost: "", notes: "" }), "Maintenance recorded."); }} className="card p-4 flex flex-wrap items-end gap-3">
              <select required className="input" value={maintenanceForm.assetId} onChange={(e) => setMaintenanceForm((f) => ({ ...f, assetId: e.target.value }))}>
                <option value="">Asset…</option>
                {assets.map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode}</option>))}
              </select>
              <select className="input" value={maintenanceForm.type} onChange={(e) => setMaintenanceForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="PREVENTIVE">Preventive</option><option value="CORRECTIVE">Corrective</option>
              </select>
              <input type="date" className="input" value={maintenanceForm.completedDate} onChange={(e) => setMaintenanceForm((f) => ({ ...f, completedDate: e.target.value }))} />
              <input placeholder="Service provider" className="input" value={maintenanceForm.serviceProvider} onChange={(e) => setMaintenanceForm((f) => ({ ...f, serviceProvider: e.target.value }))} />
              <input type="number" step="0.01" placeholder="Cost" className="input !w-28" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm((f) => ({ ...f, cost: e.target.value }))} />
              <button type="submit" disabled={busy} className="btn-primary">Record</button>
            </form>
          </>
        )}

        {tab === "depreciation" && (
          <form onSubmit={(e) => { e.preventDefault(); submit(() => api.processAssetDepreciation(depreciationForm.assetId, depreciationForm.periodLabel), () => setDepreciationForm({ assetId: "", periodLabel: "" }), "Depreciation posted."); }} className="card p-4 flex flex-wrap items-end gap-3">
            <select required className="input" value={depreciationForm.assetId} onChange={(e) => setDepreciationForm((f) => ({ ...f, assetId: e.target.value }))}>
              <option value="">Asset…</option>
              {assets.filter((a: any) => a.status !== "DISPOSED").map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>))}
            </select>
            <input required placeholder="Period (e.g. January 2026)" className="input flex-1 min-w-[180px]" value={depreciationForm.periodLabel} onChange={(e) => setDepreciationForm((f) => ({ ...f, periodLabel: e.target.value }))} />
            <button type="submit" disabled={busy} className="btn-primary">Post Depreciation</button>
          </form>
        )}

        {tab === "disposal" && (
          <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createAssetDisposal({ ...disposalForm, saleProceeds: disposalForm.saleProceeds ? Number(disposalForm.saleProceeds) : undefined }), () => setDisposalForm({ assetId: "", disposalType: "SALE", disposalDate: "", saleProceeds: "", reason: "" }), "Disposal submitted for approval."); }} className="card p-4 flex flex-wrap items-end gap-3">
            <select required className="input" value={disposalForm.assetId} onChange={(e) => setDisposalForm((f) => ({ ...f, assetId: e.target.value }))}>
              <option value="">Asset…</option>
              {assets.filter((a: any) => a.status !== "DISPOSED").map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>))}
            </select>
            <select className="input" value={disposalForm.disposalType} onChange={(e) => setDisposalForm((f) => ({ ...f, disposalType: e.target.value }))}>
              <option value="SALE">Sale</option><option value="DONATION">Donation</option><option value="WRITE_OFF">Write-Off</option><option value="SCRAP">Scrap</option>
            </select>
            <input required type="date" className="input" value={disposalForm.disposalDate} onChange={(e) => setDisposalForm((f) => ({ ...f, disposalDate: e.target.value }))} />
            {disposalForm.disposalType === "SALE" && <input required type="number" step="0.01" placeholder="Sale proceeds" className="input !w-36" value={disposalForm.saleProceeds} onChange={(e) => setDisposalForm((f) => ({ ...f, saleProceeds: e.target.value }))} />}
            <input required placeholder="Reason" className="input flex-1 min-w-[160px]" value={disposalForm.reason} onChange={(e) => setDisposalForm((f) => ({ ...f, reason: e.target.value }))} />
            <button type="submit" disabled={busy} className="btn-primary">Request Disposal</button>
          </form>
        )}

        {tab === "verify" && (
          <form onSubmit={(e) => { e.preventDefault(); submit(() => api.createAssetVerification({ ...verifyForm, latitude: geo.coords?.latitude, longitude: geo.coords?.longitude }), () => setVerifyForm({ assetId: "", locationConfirmed: true, custodianConfirmed: true, condition: "GOOD", notes: "" }), "Verification recorded."); }} className="card p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <select required className="input" value={verifyForm.assetId} onChange={(e) => setVerifyForm((f) => ({ ...f, assetId: e.target.value }))}>
                <option value="">Asset (or use Scan Asset above)…</option>
                {assets.filter((a: any) => a.status !== "DISPOSED").map((a: any) => (<option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>))}
              </select>
              <select className="input" value={verifyForm.condition} onChange={(e) => setVerifyForm((f) => ({ ...f, condition: e.target.value }))}>
                <option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="POOR">Poor</option><option value="DAMAGED">Damaged</option><option value="MISSING">Missing</option>
              </select>
            </div>
            <div className="flex gap-4 mb-3 text-[12.5px] text-text-700">
              <label className="flex items-center gap-1"><input type="checkbox" checked={verifyForm.locationConfirmed} onChange={(e) => setVerifyForm((f) => ({ ...f, locationConfirmed: e.target.checked }))} /> Location confirmed</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={verifyForm.custodianConfirmed} onChange={(e) => setVerifyForm((f) => ({ ...f, custodianConfirmed: e.target.checked }))} /> Custodian confirmed</label>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <button type="button" onClick={geo.capture} disabled={geo.capturing} className="btn-text text-gold-600">{geo.capturing ? "Capturing…" : "📍 Capture GPS Location"}</button>
              {geo.coords && <span className="text-[12px] text-text-700">{geo.coords.latitude.toFixed(5)}, {geo.coords.longitude.toFixed(5)}</span>}
            </div>
            <textarea placeholder="Notes" className="input w-full mb-3" value={verifyForm.notes} onChange={(e) => setVerifyForm((f) => ({ ...f, notes: e.target.value }))} />
            <button type="submit" disabled={busy} className="btn-primary">Record Verification</button>
          </form>
        )}

        {tab === "accounting" && (
          <>
            <p className="text-[12.5px] text-text-muted mb-4">Map each purpose to a real GL account before approving depreciation or disposals — the same configurable pattern already used for Payroll.</p>
            <form onSubmit={(e) => { e.preventDefault(); submit(() => api.setAssetGLMapping(mappingForm.purpose, mappingForm.glAccountId), () => setMappingForm({ purpose: "", glAccountId: "" }), "Mapping saved."); }} className="card p-4 mb-6 flex flex-wrap items-end gap-3">
              <select required className="input" value={mappingForm.purpose} onChange={(e) => setMappingForm((f) => ({ ...f, purpose: e.target.value }))}>
                <option value="">Purpose…</option>
                {glMappings.purposes.map((p: string) => (<option key={p} value={p}>{p}</option>))}
              </select>
              <select required className="input" value={mappingForm.glAccountId} onChange={(e) => setMappingForm((f) => ({ ...f, glAccountId: e.target.value }))}>
                <option value="">GL Account…</option>
                {glMappings.accounts.map((a: any) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
              </select>
              <button type="submit" disabled={busy} className="btn-primary">Save Mapping</button>
            </form>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Purpose</th><th>Mapped Account</th></tr></thead><tbody>
              {glMappings.purposes.map((p: string) => { const m = glMappings.mappings.find((x: any) => x.purpose === p); return (<tr key={p}><td className="text-text-900">{p}</td><td className="text-text-700">{m?.account ? `${m.account.code} — ${m.account.name}` : <span className="text-rose-600">Not mapped</span>}</td></tr>); })}
            </tbody></table></div>
          </>
        )}

        {tab === "reports" && (
          <>
            {valuation && (
              <div className="grid grid-cols-2 dt:grid-cols-3 gap-3 mb-8">
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {valuation.totalCost.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase">Total Cost</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-gold-600">GHS {valuation.totalNetBookValue.toLocaleString()}</div><div className="text-[10.5px] text-text-muted uppercase">Net Book Value</div></div>
                <div className="card p-3.5"><div className="font-display font-semibold text-lg text-text-900">{valuation.assetCount}</div><div className="text-[10.5px] text-text-muted uppercase">Active Assets</div></div>
              </div>
            )}
            {overdueMaintenance.length > 0 && (
              <div className="card p-4 mb-6 bg-rose-100/40">
                <div className="font-medium text-[13px] text-rose-700 mb-2">Overdue Maintenance</div>
                {overdueMaintenance.map((o: any, i: number) => (<div key={i} className="text-[12.5px] text-text-700">{o.assetName} ({o.assetCode}) — {o.daysOverdue} days overdue</div>))}
              </div>
            )}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Lifecycle / Remaining Useful Life</h2>
            <div className="card overflow-x-auto mb-8"><table className="w-full text-sm table-modern"><thead><tr><th>Asset</th><th>Age</th><th>Remaining Life</th><th>NBV</th></tr></thead><tbody>
              {lifecycle.map((a: any) => (<tr key={a.id}><td className="text-text-900">{a.assetCode} — {a.name}</td><td className="text-text-700">{a.ageMonths} mo</td><td className="text-text-700">{a.remainingUsefulLifeMonths} mo</td><td className="text-text-700">GHS {a.netBookValue.toLocaleString()}</td></tr>))}
            </tbody></table></div>
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">By Branch</h2>
            <div className="card overflow-x-auto"><table className="w-full text-sm table-modern"><thead><tr><th>Branch</th><th>Assets</th><th>Total Cost</th></tr></thead><tbody>
              {byBranchReport.map((b: any) => (<tr key={b.name}><td className="text-text-900">{b.name}</td><td className="text-text-700">{b.count}</td><td className="text-text-700">GHS {b.totalCost.toLocaleString()}</td></tr>))}
            </tbody></table></div>
          </>
        )}
      </div>
    </AppShell>
  );
}
