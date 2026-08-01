"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

const STAGES = ["AWARENESS", "ACQUISITION", "ONBOARDING", "ACTIVATION", "GROWTH", "RETENTION", "ADVOCACY", "RE_ENGAGEMENT"];
const STATUSES = ["REGISTERED", "PENDING_VERIFICATION", "PENDING_APPROVAL", "VERIFIED", "ACTIVE", "DORMANT", "RESTRICTED", "SUSPENDED", "BLACKLISTED", "CLOSED", "ARCHIVED"];
const KYC_STATUSES = ["PENDING", "VERIFIED", "REJECTED"];
const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];
const RISK_RATINGS = ["LOW", "MEDIUM", "HIGH"];
const CLOSURE_REASONS = ["CUSTOMER_REQUEST", "DEATH", "BUSINESS_CLOSURE", "FRAUD", "REGULATORY_DIRECTIVE", "DUPLICATE_MERGE", "MIGRATION", "INACTIVITY", "INSTITUTIONAL_DECISION", "COURT_ORDER", "OTHER"];
const PEP_STATUSES = ["NOT_PEP", "DOMESTIC_PEP", "FOREIGN_PEP", "PEP_ASSOCIATE"];

type TimelineEvent = { date: string; label: string; detail: string; amount?: string };

const emptyKin = { fullName: "", relationship: "", phone: "", email: "", address: "" };
const emptyBeneficiary = { fullName: "", relationship: "", allocationPct: "", phone: "" };
const emptyOwner = { fullName: "", ownershipPct: "", idType: "", idNumber: "" };
const DOCUMENT_TYPES = ["NATIONAL_ID","PASSPORT","DRIVERS_LICENCE","VOTER_ID","BUSINESS_REGISTRATION","TAX_CERTIFICATE","UTILITY_BILL","PROOF_OF_ADDRESS","PHOTOGRAPH","SIGNATURE","LOAN_DOCUMENT","CONTRACT","CONSENT_FORM","OTHER"];

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const id = params.id as string;
  const [customer, setCustomer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "", phone: "", email: "", segment: "INDIVIDUAL", riskRating: "", preferredChannel: "", preferredLanguage: "",
    smsEnabled: true, emailEnabled: true, whatsappEnabled: true, marketingEnabled: false, transactionAlertsEnabled: true, statementDeliveryEnabled: true,
  });

  const [kinForm, setKinForm] = useState(emptyKin);
  const [noteText, setNoteText] = useState("");
  const [beneficiaryForm, setBeneficiaryForm] = useState(emptyBeneficiary);
  const [ownerForm, setOwnerForm] = useState(emptyOwner);

  const [documents, setDocuments] = useState<any[]>([]);
  const [kycChecklist, setKycChecklist] = useState<any>(null);
  const [cddForm, setCddForm] = useState({ pepStatus: "NOT_PEP", cddNotes: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("NATIONAL_ID");
  const [docExpiry, setDocExpiry] = useState("");
  const [uploading, setUploading] = useState(false);

  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closureReason, setClosureReason] = useState("CUSTOMER_REQUEST");
  const [closureNote, setClosureNote] = useState("");

  function load() {
    api.getCustomer(id).then((res) => {
      setCustomer(res.customer);
      setEditForm({
        fullName: res.customer.fullName,
        phone: res.customer.phone,
        email: res.customer.email || "",
        segment: res.customer.segment,
        riskRating: res.customer.riskRating || "",
        preferredChannel: res.customer.preferredChannel || "",
        preferredLanguage: res.customer.preferredLanguage || "",
        smsEnabled: res.customer.smsEnabled,
        emailEnabled: res.customer.emailEnabled,
        whatsappEnabled: res.customer.whatsappEnabled,
        marketingEnabled: res.customer.marketingEnabled,
        transactionAlertsEnabled: res.customer.transactionAlertsEnabled,
        statementDeliveryEnabled: res.customer.statementDeliveryEnabled,
      });
      setCddForm({ pepStatus: res.customer.pepStatus || "NOT_PEP", cddNotes: res.customer.cddNotes || "" });
    }).catch((err) => setError(err.message));
    loadDocuments();
    api.getKycChecklist(id).then(setKycChecklist).catch(() => {});
  }

  function loadDocuments() {
    api.listDocuments(id).then((res) => setDocuments(res.documents)).catch(() => {});
  }

  async function handleUpdateCdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.updateCustomerCdd(id, cddForm);
      toast.success("CDD updated.");
      load();
    } catch (err: any) { setError(err.message || "Could not update CDD"); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) return;
    setUploading(true); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", docFile);
      formData.append("customerId", id);
      formData.append("documentType", docType);
      if (docExpiry) formData.append("expiryDate", new Date(docExpiry).toISOString());
      await api.uploadDocument(formData);
      setDocFile(null);
      setDocExpiry("");
      loadDocuments();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleReplaceDocument(docId: string, file: File) {
    setBusy(true); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.replaceDocument(docId, formData);
      toast.success("Document replaced — previous version archived.");
      loadDocuments();
    } catch (err: any) {
      setError(err.message || "Could not replace document");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyDocument(docId: string) {
    setBusy(true); setError(null);
    try { await api.verifyDocument(docId); loadDocuments(); }
    catch (err: any) { setError(err.message || "Could not verify document"); }
    finally { setBusy(false); }
  }

  async function handleArchiveDocument(docId: string) {
    setBusy(true); setError(null);
    try { await api.archiveDocument(docId); loadDocuments(); }
    catch (err: any) { setError(err.message || "Could not archive document"); }
    finally { setBusy(false); }
  }

  async function handleDisposeDocument(docId: string) {
    setBusy(true); setError(null);
    try { await api.disposeDocument(docId); loadDocuments(); }
    catch (err: any) { setError(err.message || "Could not dispose document"); }
    finally { setBusy(false); }
  }

  async function handleStageChange(lifecycleStage: string) {
    setBusy(true); setError(null);
    try { await api.updateCustomerStage(id, lifecycleStage); load(); }
    catch (err: any) { setError(err.message || "Could not update stage"); }
    finally { setBusy(false); }
  }

  async function handleStatusChange(status: string) {
    setBusy(true); setError(null);
    try {
      const res = await api.updateCustomerStatus(id, status);
      if (res?.pendingApproval) toast.info("Status change submitted for approval — a different authorised user must approve it.");
      load();
    }
    catch (err: any) { setError(err.message || "Could not update status"); }
    finally { setBusy(false); }
  }

  async function handleKycChange(kycStatus: string) {
    setBusy(true); setError(null);
    try { await api.updateCustomerKyc(id, kycStatus); load(); }
    catch (err: any) { setError(err.message || "Could not update KYC status"); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true); setError(null);
    try {
      const res = await api.updateCustomer(id, {
        ...editForm,
        email: editForm.email || null,
        riskRating: editForm.riskRating || null,
        preferredChannel: editForm.preferredChannel || null,
        preferredLanguage: editForm.preferredLanguage || null,
      });
      if (res?.pendingApproval) toast.info("Critical field change submitted for approval — a different authorised user must approve it.");
      setEditing(false);
      load();
    } catch (err: any) { setError(err.message || "Could not update customer"); }
    finally { setBusy(false); }
  }

  async function handleArchive(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.archiveCustomer(id, { closureReason, closureNote: closureNote || undefined });
      setShowCloseForm(false);
      load();
    } catch (err: any) { setError(err.message || "Action failed"); }
    finally { setBusy(false); }
  }

  async function handleUnarchive() {
    setBusy(true); setError(null);
    try { await api.unarchiveCustomer(id); load(); }
    catch (err: any) { setError(err.message || "Action failed"); }
    finally { setBusy(false); }
  }

  async function clearDuplicateFlag() {
    setBusy(true); setError(null);
    try { await api.clearDuplicateFlag(id); load(); }
    catch (err: any) { setError(err.message || "Action failed"); }
    finally { setBusy(false); }
  }

  async function handleAddKin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addNextOfKin(id, { ...kinForm, email: kinForm.email || undefined, address: kinForm.address || undefined });
      setKinForm(emptyKin);
      load();
    } catch (err: any) { setError(err.message || "Could not add next of kin"); }
    finally { setBusy(false); }
  }

  async function handleDeleteKin(kinId: string) {
    setBusy(true); setError(null);
    try { await api.deleteNextOfKin(id, kinId); load(); }
    catch (err: any) { setError(err.message || "Could not remove"); }
    finally { setBusy(false); }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.addCustomerNote(id, noteText);
      setNoteText("");
      load();
    } catch (err: any) { setError(err.message || "Could not add note"); }
    finally { setBusy(false); }
  }

  async function handleAddBeneficiary(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addBeneficiary(id, { ...beneficiaryForm, allocationPct: Number(beneficiaryForm.allocationPct), phone: beneficiaryForm.phone || undefined });
      setBeneficiaryForm(emptyBeneficiary);
      load();
    } catch (err: any) { setError(err.message || "Could not add beneficiary"); }
    finally { setBusy(false); }
  }

  async function handleDeleteBeneficiary(beneficiaryId: string) {
    setBusy(true); setError(null);
    try { await api.deleteBeneficiary(id, beneficiaryId); load(); }
    catch (err: any) { setError(err.message || "Could not remove"); }
    finally { setBusy(false); }
  }

  async function handleAddOwner(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addBeneficialOwner(id, { ...ownerForm, ownershipPct: Number(ownerForm.ownershipPct), idType: ownerForm.idType || undefined, idNumber: ownerForm.idNumber || undefined });
      setOwnerForm(emptyOwner);
      load();
    } catch (err: any) { setError(err.message || "Could not add beneficial owner"); }
    finally { setBusy(false); }
  }

  async function handleDeleteOwner(ownerId: string) {
    setBusy(true); setError(null);
    try { await api.deleteBeneficialOwner(id, ownerId); load(); }
    catch (err: any) { setError(err.message || "Could not remove"); }
    finally { setBusy(false); }
  }

  const events: TimelineEvent[] = [];
  if (customer) {
    for (const loan of customer.loans || []) {
      events.push({ date: loan.createdAt, label: "Loan initiated", detail: `${loan.status} · GHS ${Number(loan.principal).toLocaleString()} at ${loan.interestRate}% over ${loan.termMonths}mo` });
      if (loan.disbursedAt) events.push({ date: loan.disbursedAt, label: "Loan disbursed", detail: `GHS ${Number(loan.principal).toLocaleString()}` });
      for (const r of loan.repayments || []) events.push({ date: r.paidAt, label: "Loan repayment", detail: "Recorded against loan", amount: `+GHS ${Number(r.amount).toLocaleString()}` });
    }
    for (const acct of customer.savingsAccounts || []) {
      events.push({ date: acct.createdAt, label: "Savings account opened", detail: acct.accountNumber });
      for (const t of acct.transactions || []) {
        events.push({
          date: t.createdAt,
          label: t.type === "DEPOSIT" ? "Savings deposit" : "Savings withdrawal",
          detail: `${acct.accountNumber} · balance after GHS ${Number(t.balanceAfter).toLocaleString()}`,
          amount: `${t.type === "DEPOSIT" ? "+" : "-"}GHS ${Number(t.amount).toLocaleString()}`,
        });
      }
    }
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  const isBusinessLike = customer && ["BUSINESS", "CORPORATE"].includes(customer.segment);

  return (
    <AppShell active="Customers">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <button onClick={() => router.push("/customers")} className="text-[13px] text-text-muted hover:text-text-700 mb-4">← Back to Customers</button>

        {!customer && !error && <p className="text-text-muted text-sm">Loading…</p>}

        {customer && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600">{customer.segment.replaceAll("_", " ")}</div>
              <div className="flex gap-2">
                {customer.archived && <span className="badge bg-rose-100 text-rose-600">Archived{customer.closureReason ? ` · ${customer.closureReason.replaceAll("_", " ")}` : ""}</span>}
                {customer.status === "BLACKLISTED" && <span className="badge bg-rose-100 text-rose-600">Blacklisted — pending AML adjudication</span>}
                {customer.status === "PENDING_APPROVAL" && <span className="badge bg-violet-500/15 text-violet-500">Pending approval</span>}
                {customer.watchlistFlag && customer.status !== "BLACKLISTED" && <span className="badge bg-rose-100 text-rose-600">Watchlist match</span>}
                {customer.possibleDuplicate && (
                  <button onClick={clearDuplicateFlag} disabled={busy} className="badge bg-gold-500/15 text-gold-600">Possible duplicate — clear?</button>
                )}
              </div>
            </div>
            <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1 selectable">{customer.fullName}</h1>
            <div className="text-text-muted text-sm mb-6 selectable">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</div>

            <div className="card p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-base text-ink-900">Customer details</h2>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button onClick={saveEdit} disabled={busy} className="text-[12.5px] text-green-600 font-semibold">Save</button>
                      <button onClick={() => setEditing(false)} className="text-[12.5px] text-text-muted">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditing(true)} className="text-[12.5px] text-gold-600 font-semibold">Edit</button>
                      {customer.archived ? (
                        <button onClick={handleUnarchive} disabled={busy} className="text-[12.5px] font-semibold text-green-600">Unarchive</button>
                      ) : (
                        <button onClick={() => setShowCloseForm((s) => !s)} disabled={busy} className="text-[12.5px] font-semibold text-rose-600">Archive</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {showCloseForm && !customer.archived && (
                <form onSubmit={handleArchive} className="mb-4 p-4 rounded-[10px] bg-rose-100/40 border border-rose-600/20">
                  <p className="text-[12.5px] text-text-700 mb-3 font-medium">doc §45.3 — closure reason is required to archive a customer.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <select className="input !py-1.5" value={closureReason} onChange={(e) => setClosureReason(e.target.value)}>
                      {CLOSURE_REASONS.map((r) => (<option key={r} value={r}>{r.replaceAll("_", " ")}</option>))}
                    </select>
                    <input placeholder="Note (optional)" className="input !py-1.5" value={closureNote} onChange={(e) => setClosureNote(e.target.value)} />
                  </div>
                  <button type="submit" disabled={busy} className="btn-text text-rose-600 font-semibold">Confirm archive</button>
                </form>
              )}

              {editing ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                      <input className="input" value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                      <input type="tel" className="input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Email</span>
                      <input type="email" className="input" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
                      <select className="input" value={editForm.segment} onChange={(e) => setEditForm((f) => ({ ...f, segment: e.target.value }))}>
                        {SEGMENTS.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Risk rating</span>
                      <select className="input" value={editForm.riskRating} onChange={(e) => setEditForm((f) => ({ ...f, riskRating: e.target.value }))}>
                        <option value="">Not set</option>
                        {RISK_RATINGS.map((r) => (<option key={r} value={r}>{r}</option>))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Preferred channel</span>
                      <select className="input" value={editForm.preferredChannel} onChange={(e) => setEditForm((f) => ({ ...f, preferredChannel: e.target.value }))}>
                        <option value="">Not set</option>
                        <option value="SMS">SMS</option>
                        <option value="EMAIL">Email</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="CALL">Phone call</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[13px] text-text-500 mb-1.5">Preferred language</span>
                      <input className="input" value={editForm.preferredLanguage} onChange={(e) => setEditForm((f) => ({ ...f, preferredLanguage: e.target.value }))} placeholder="e.g. Ewe, Twi, English" />
                    </label>
                  </div>
                  <span className="block text-[13px] text-text-500 mb-2">Communication preferences (doc §39.2)</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12.5px] text-text-700">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={editForm.smsEnabled} onChange={(e) => setEditForm((f) => ({ ...f, smsEnabled: e.target.checked }))} /> SMS</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={editForm.emailEnabled} onChange={(e) => setEditForm((f) => ({ ...f, emailEnabled: e.target.checked }))} /> Email</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={editForm.whatsappEnabled} onChange={(e) => setEditForm((f) => ({ ...f, whatsappEnabled: e.target.checked }))} /> WhatsApp</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={editForm.transactionAlertsEnabled} onChange={(e) => setEditForm((f) => ({ ...f, transactionAlertsEnabled: e.target.checked }))} /> Transaction alerts</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={editForm.statementDeliveryEnabled} onChange={(e) => setEditForm((f) => ({ ...f, statementDeliveryEnabled: e.target.checked }))} /> Statement delivery</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={editForm.marketingEnabled} onChange={(e) => setEditForm((f) => ({ ...f, marketingEnabled: e.target.checked }))} /> Marketing (opt-in)</label>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Account status <span className="text-text-muted normal-case">(gates transactions)</span></span>
                    <select disabled={busy || customer.archived} className="input" value={customer.status} onChange={(e) => handleStatusChange(e.target.value)}>
                      {STATUSES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">Lifecycle stage <span className="text-text-muted normal-case">(CRM journey)</span></span>
                    <select disabled={busy || customer.archived} className="input" value={customer.lifecycleStage} onChange={(e) => handleStageChange(e.target.value)}>
                      {STAGES.map((s) => (<option key={s} value={s}>{s.replaceAll("_", " ")}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[13px] text-text-500 mb-1.5">KYC status</span>
                    <select disabled={busy || customer.archived} className="input" value={customer.kycStatus} onChange={(e) => handleKycChange(e.target.value)}>
                      {KYC_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </label>
                  {(customer.riskRating || customer.preferredChannel || customer.preferredLanguage) && (
                    <div className="sm:col-span-3 flex flex-wrap gap-4 text-[12.5px] text-text-500 pt-1">
                      {customer.riskRating && <span>Risk: <b className="text-text-700">{customer.riskRating}</b></span>}
                      {customer.preferredChannel && <span>Prefers: <b className="text-text-700">{customer.preferredChannel}</b></span>}
                      {customer.preferredLanguage && <span>Language: <b className="text-text-700">{customer.preferredLanguage}</b></span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              <Stat label="Loans" value={String((customer.loans || []).length)} />
              <Stat label="Savings accounts" value={String((customer.savingsAccounts || []).length)} />
              <Stat label="Customer since" value={new Date(customer.createdAt).toLocaleDateString()} />
            </div>

            {/* KYC Checklist + CDD/PEP — doc §30/§58. Computed live against
                actual uploaded documents; no expiry monitoring/re-screening
                yet, both need a job scheduler that doesn't exist. */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">KYC & Due Diligence</h2>
            {kycChecklist && (
              <div className="card p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-text-700">Document checklist</span>
                  <span className={`badge ${kycChecklist.complete ? "bg-green-100 text-green-600" : "bg-gold-500/15 text-gold-600"}`}>{kycChecklist.percentComplete}% complete</span>
                </div>
                <div className="space-y-1.5 mb-2">
                  {kycChecklist.checklist.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[12.5px] text-text-700">
                      <span className={c.satisfied ? "text-green-600" : "text-text-muted"}>{c.satisfied ? "✓" : "○"}</span>
                      {c.label}
                    </div>
                  ))}
                </div>
                {!kycChecklist.complete && <p className="text-text-muted text-xs">Missing: {kycChecklist.missing.join(", ")}</p>}
              </div>
            )}
            <form onSubmit={handleUpdateCdd} className="card p-5 mb-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">PEP status</span>
                  <select className="input" value={cddForm.pepStatus} onChange={(e) => setCddForm((f) => ({ ...f, pepStatus: e.target.value }))}>
                    {PEP_STATUSES.map((p) => (<option key={p} value={p}>{p.replaceAll("_", " ")}</option>))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[13px] text-text-500 mb-1.5">CDD level <span className="text-text-muted normal-case">(auto-derived)</span></span>
                  <input disabled className="input opacity-70" value={customer.cddLevel || "STANDARD"} />
                </label>
              </div>
              <label className="block mb-3">
                <span className="block text-[13px] text-text-500 mb-1.5">CDD notes</span>
                <textarea rows={2} className="input" value={cddForm.cddNotes} onChange={(e) => setCddForm((f) => ({ ...f, cddNotes: e.target.value }))} />
              </label>
              {customer.cddCompletedAt && <p className="text-text-muted text-xs mb-3">Last updated {new Date(customer.cddCompletedAt).toLocaleString()}</p>}
              <button type="submit" disabled={busy} className="btn-text text-gold-600">Save CDD</button>
            </form>

            {/* Documents — doc §30/§69. Files live in Supabase Storage (private
                bucket); only metadata + checksum are stored here. */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Documents</h2>
            <form onSubmit={handleUploadDocument} className="card p-5 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
                <input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input !py-1.5 file:mr-3 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-gold-500/15 file:text-gold-600 file:text-[12px]" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                <select className="input !py-1.5" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOCUMENT_TYPES.map((t) => (<option key={t} value={t}>{t.replaceAll("_", " ")}</option>))}
                </select>
                <input type="date" placeholder="Expiry (optional)" className="input !py-1.5" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
                <button type="submit" disabled={uploading || !docFile} className="btn-text text-gold-600 justify-self-start">{uploading ? "Uploading…" : "+ Upload document"}</button>
              </div>
              <p className="text-text-muted text-xs">JPEG, PNG, WEBP, or PDF, up to 10MB.</p>
            </form>
            <div className="space-y-2 mb-10">
              {documents.map((d: any) => {
                const statusColor =
                  d.status === "VERIFIED" || d.status === "APPROVED" || d.status === "ACTIVE" ? "bg-green-100 text-green-600"
                  : d.status === "ARCHIVED" ? "bg-paper-100 text-text-muted"
                  : "bg-violet-500/15 text-violet-500";
                return (
                  <div key={d.id} className="card p-3 flex items-center justify-between text-[13px] gap-2 flex-wrap">
                    <span className="text-text-700">
                      <b className="text-text-900">{d.documentName}</b> · {d.documentType.replaceAll("_", " ")} · v{d.versionNumber}
                      {d.expiryDate && ` · expires ${new Date(d.expiryDate).toLocaleDateString()}`}
                      {" "}<span className={`badge ${statusColor}`}>{d.status}</span>
                    </span>
                    <div className="space-x-2 whitespace-nowrap flex items-center">
                      {d.signedUrl && <a href={d.signedUrl} target="_blank" rel="noreferrer" className="text-gold-600 text-[12px] font-semibold">View</a>}
                      {d.status === "UPLOADED" && <button onClick={() => handleVerifyDocument(d.id)} disabled={busy} className="text-green-600 text-[12px]">Verify</button>}
                      {d.status !== "ARCHIVED" && (
                        <label className="text-gold-600 text-[12px] cursor-pointer">
                          Replace
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceDocument(d.id, f); }} />
                        </label>
                      )}
                      {d.status !== "ARCHIVED" && <button onClick={() => handleArchiveDocument(d.id)} disabled={busy} className="text-text-muted text-[12px]">Archive</button>}
                      <button onClick={() => handleDisposeDocument(d.id)} disabled={busy} className="text-rose-600 text-[12px]">Dispose</button>
                    </div>
                  </div>
                );
              })}
              {documents.length === 0 && <p className="text-text-muted text-sm">No documents uploaded yet.</p>}
            </div>

            {/* Next of Kin — doc §38 */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Next of kin</h2>
            <form onSubmit={handleAddKin} className="card p-5 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-3">
                <input required placeholder="Full name" className="input !py-1.5" value={kinForm.fullName} onChange={(e) => setKinForm((f) => ({ ...f, fullName: e.target.value }))} />
                <input required placeholder="Relationship" className="input !py-1.5" value={kinForm.relationship} onChange={(e) => setKinForm((f) => ({ ...f, relationship: e.target.value }))} />
                <input required type="tel" placeholder="Phone" className="input !py-1.5" value={kinForm.phone} onChange={(e) => setKinForm((f) => ({ ...f, phone: e.target.value }))} />
                <input type="email" placeholder="Email (optional)" className="input !py-1.5" value={kinForm.email} onChange={(e) => setKinForm((f) => ({ ...f, email: e.target.value }))} />
                <input placeholder="Address (optional)" className="input !py-1.5" value={kinForm.address} onChange={(e) => setKinForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <button type="submit" disabled={busy} className="btn-text text-gold-600">+ Add next of kin</button>
            </form>
            <div className="space-y-2 mb-8">
              {(customer.nextOfKin || []).map((k: any) => (
                <div key={k.id} className="card p-3 flex items-center justify-between text-[13px]">
                  <span className="text-text-700"><b className="text-text-900">{k.fullName}</b> · {k.relationship} · {k.phone}{k.email ? ` · ${k.email}` : ""}</span>
                  <button onClick={() => handleDeleteKin(k.id)} className="text-rose-600 text-[12px]">Remove</button>
                </div>
              ))}
              {(!customer.nextOfKin || customer.nextOfKin.length === 0) && <p className="text-text-muted text-sm">None recorded.</p>}
            </div>

            {/* Beneficiaries — doc §37 */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Beneficiaries</h2>
            <form onSubmit={handleAddBeneficiary} className="card p-5 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
                <input required placeholder="Full name" className="input !py-1.5" value={beneficiaryForm.fullName} onChange={(e) => setBeneficiaryForm((f) => ({ ...f, fullName: e.target.value }))} />
                <input required placeholder="Relationship" className="input !py-1.5" value={beneficiaryForm.relationship} onChange={(e) => setBeneficiaryForm((f) => ({ ...f, relationship: e.target.value }))} />
                <input required type="number" min="0" max="100" placeholder="Allocation %" className="input !py-1.5" value={beneficiaryForm.allocationPct} onChange={(e) => setBeneficiaryForm((f) => ({ ...f, allocationPct: e.target.value }))} />
                <input type="tel" placeholder="Phone (optional)" className="input !py-1.5" value={beneficiaryForm.phone} onChange={(e) => setBeneficiaryForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <button type="submit" disabled={busy} className="btn-text text-gold-600">+ Add beneficiary</button>
              {customer.beneficiaries && customer.beneficiaries.length > 0 && (
                <p className="text-text-muted text-xs mt-2">Current total allocation: {customer.beneficiaries.reduce((s: number, b: any) => s + Number(b.allocationPct), 0)}%</p>
              )}
            </form>
            <div className="space-y-2 mb-8">
              {(customer.beneficiaries || []).map((b: any) => (
                <div key={b.id} className="card p-3 flex items-center justify-between text-[13px]">
                  <span className="text-text-700"><b className="text-text-900">{b.fullName}</b> · {b.relationship} · {Number(b.allocationPct)}%{b.phone ? ` · ${b.phone}` : ""}</span>
                  <button onClick={() => handleDeleteBeneficiary(b.id)} className="text-rose-600 text-[12px]">Remove</button>
                </div>
              ))}
              {(!customer.beneficiaries || customer.beneficiaries.length === 0) && <p className="text-text-muted text-sm">None recorded.</p>}
            </div>

            {/* Beneficial Owners — doc §32, Business/Corporate only */}
            {isBusinessLike && (
              <>
                <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Beneficial owners</h2>
                <form onSubmit={handleAddOwner} className="card p-5 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
                    <input required placeholder="Full name" className="input !py-1.5" value={ownerForm.fullName} onChange={(e) => setOwnerForm((f) => ({ ...f, fullName: e.target.value }))} />
                    <input required type="number" min="0" max="100" placeholder="Ownership %" className="input !py-1.5" value={ownerForm.ownershipPct} onChange={(e) => setOwnerForm((f) => ({ ...f, ownershipPct: e.target.value }))} />
                    <input placeholder="ID type (optional)" className="input !py-1.5" value={ownerForm.idType} onChange={(e) => setOwnerForm((f) => ({ ...f, idType: e.target.value }))} />
                    <input placeholder="ID number (optional)" className="input !py-1.5" value={ownerForm.idNumber} onChange={(e) => setOwnerForm((f) => ({ ...f, idNumber: e.target.value }))} />
                  </div>
                  <button type="submit" disabled={busy} className="btn-text text-gold-600">+ Add beneficial owner</button>
                </form>
                <div className="space-y-2 mb-8">
                  {(customer.beneficialOwners || []).map((o: any) => (
                    <div key={o.id} className="card p-3 flex items-center justify-between text-[13px]">
                      <span className="text-text-700"><b className="text-text-900">{o.fullName}</b> · {Number(o.ownershipPct)}%{o.idNumber ? ` · ${o.idType || "ID"} ${o.idNumber}` : ""}</span>
                      <button onClick={() => handleDeleteOwner(o.id)} className="text-rose-600 text-[12px]">Remove</button>
                    </div>
                  ))}
                  {(!customer.beneficialOwners || customer.beneficialOwners.length === 0) && <p className="text-text-muted text-sm">None recorded.</p>}
                </div>
              </>
            )}

            {/* Notes — doc §28/§40 */}
            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Notes</h2>
            <form onSubmit={handleAddNote} className="card p-5 mb-4">
              <textarea rows={2} placeholder="Log a call, complaint, or interaction…" className="input mb-3" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button type="submit" disabled={busy} className="btn-text text-gold-600">+ Add note</button>
            </form>
            <div className="space-y-2 mb-10">
              {(customer.notes || []).map((n: any) => (
                <div key={n.id} className="card p-3 text-[13px]">
                  <div className="text-text-700">{n.note}</div>
                  <div className="text-text-muted text-[11px] mt-1">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {(!customer.notes || customer.notes.length === 0) && <p className="text-text-muted text-sm">No notes yet.</p>}
            </div>

            <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">History</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm table-modern">
                <thead><tr><th>Date</th><th>Event</th><th>Detail</th><th>Amount</th></tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td className="text-text-700 whitespace-nowrap">{new Date(e.date).toLocaleString()}</td>
                      <td className="text-text-900 font-medium">{e.label}</td>
                      <td className="text-text-700">{e.detail}</td>
                      <td className={`font-mono text-[12.5px] ${e.amount?.startsWith("+") ? "text-green-600" : e.amount?.startsWith("-") ? "text-rose-600" : "text-text-muted"}`}>{e.amount || "—"}</td>
                    </tr>
                  ))}
                  {events.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No activity yet.</td></tr>}
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
