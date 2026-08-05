"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";
import { CodeScanner } from "@/components/CodeScanner";

type Tab = "search" | "duplicates" | "merges";

export default function CustomerDataQualityPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [tab, setTab] = useState<Tab>("search");
  const [busy, setBusy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [mergeRequests, setMergeRequests] = useState<any[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { const res = await api.searchCustomers({ q: searchQ }); setSearchResults(res.customers); }
    catch (err: any) { setError(err.message || "Search failed"); } finally { setBusy(false); }
  }

  function handleScanResult(code: string) {
    setShowScanner(false);
    api.lookupCustomerByCode(code).then((r) => { setSearchResults([r.customer]); toast.success(`Found: ${r.customer.fullName}`); })
      .catch(() => setError(`No customer found matching code "${code}"`));
  }

  function loadDuplicates() {
    setBusy(true); setError(null);
    api.detectDuplicateCustomers().then((r) => setCandidates(r.candidates)).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }

  function loadMergeRequests() {
    api.listCustomerMergeRequests().then((r) => setMergeRequests(r.records)).catch(() => {});
  }

  useEffect(() => { if (tab === "duplicates") loadDuplicates(); if (tab === "merges") loadMergeRequests(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRequestMerge(primaryId: string, mergedId: string) {
    setBusy(true); setError(null);
    try { await api.requestCustomerMerge(primaryId, mergedId); toast.info("Merge submitted for approval."); loadDuplicates(); }
    catch (err: any) { setError(err.message || "Could not request merge"); } finally { setBusy(false); }
  }

  async function handleRollback(id: string) {
    const reason = window.prompt("Reason for rolling back this merge:");
    if (!reason) return;
    setBusy(true); setError(null);
    try { await api.rollbackCustomerMerge(id, reason); toast.info("Merge rolled back."); loadMergeRequests(); }
    catch (err: any) { setError(err.message || "Could not roll back merge"); } finally { setBusy(false); }
  }

  return (
    <AppShell active="Customers">
      <div className="p-5 dt:p-10 overflow-x-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900">Customer Data Quality</h1>
          <button onClick={() => setShowScanner(true)} className="btn-primary">📷 Scan Customer</button>
        </div>
        <p className="text-text-muted text-sm mb-6">doc §25/§35 — advanced search, QR/barcode lookup, and duplicate detection/merge with atomic, reversible reassignment.</p>

        {showScanner && <CodeScanner onDetected={handleScanResult} onClose={() => setShowScanner(false)} />}

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTab("search")} className={`btn-text ${tab === "search" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Search</button>
          <button onClick={() => setTab("duplicates")} className={`btn-text ${tab === "duplicates" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Duplicate Detection</button>
          <button onClick={() => setTab("merges")} className={`btn-text ${tab === "merges" ? "text-gold-600 font-semibold" : "text-text-muted"}`}>Merge Requests</button>
        </div>

        {tab === "search" && (
          <>
            <form onSubmit={handleSearch} className="card p-4 mb-6 flex items-end gap-3">
              <input placeholder="Name, phone, email, customer number, or ID number" className="input flex-1" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
              <button type="submit" disabled={busy} className="btn-primary">Search</button>
            </form>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm table-modern">
                <thead><tr><th>Customer #</th><th>Name</th><th>Phone</th><th>Status</th><th>Risk</th></tr></thead>
                <tbody>
                  {searchResults.map((c: any) => (
                    <tr key={c.id}>
                      <td className="font-mono text-[12px] text-text-700">{c.customerNumber || "—"}</td>
                      <td className="text-text-900"><a href={`/customers/${c.id}`} className="hover:text-gold-600">{c.fullName}</a></td>
                      <td className="text-text-700">{c.phone}</td>
                      <td className="text-text-700">{c.status}</td>
                      <td>{c.riskRating && <span className={`badge ${c.riskRating === "HIGH" ? "bg-rose-100 text-rose-600" : c.riskRating === "MEDIUM" ? "bg-gold-500/15 text-gold-600" : "bg-green-100 text-green-600"}`}>{c.riskRating}</span>}</td>
                    </tr>
                  ))}
                  {searchResults.length === 0 && <tr><td colSpan={5} className="text-center text-text-muted text-sm py-8">No results yet — search above.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "duplicates" && (
          <div className="space-y-3">
            {candidates.map((c: any, i: number) => (
              <div key={i} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] text-text-900">
                    <a href={`/customers/${c.customerA.id}`} className="hover:text-gold-600 font-medium">{c.customerA.fullName}</a>
                    {" ↔ "}
                    <a href={`/customers/${c.customerB.id}`} className="hover:text-gold-600 font-medium">{c.customerB.fullName}</a>
                  </div>
                  <span className={`badge ${c.score >= 70 ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{c.score}% match</span>
                </div>
                <div className="text-[11.5px] text-text-muted mb-3">Matched: {c.matchedFields.join(", ")}</div>
                <div className="flex gap-2">
                  <button onClick={() => handleRequestMerge(c.customerA.id, c.customerB.id)} disabled={busy} className="btn-text text-gold-600">Merge B into A</button>
                  <button onClick={() => handleRequestMerge(c.customerB.id, c.customerA.id)} disabled={busy} className="btn-text text-gold-600">Merge A into B</button>
                </div>
              </div>
            ))}
            {candidates.length === 0 && !busy && <p className="text-text-muted text-sm text-center py-8">No likely duplicates found.</p>}
          </div>
        )}

        {tab === "merges" && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm table-modern">
              <thead><tr><th>Similarity</th><th>Status</th><th>Requested</th><th></th></tr></thead>
              <tbody>
                {mergeRequests.map((r: any) => (
                  <tr key={r.id}>
                    <td className="text-text-700">{r.similarityScore}%</td>
                    <td><span className={`badge ${r.status === "APPROVED" ? "bg-green-100 text-green-600" : r.status === "REJECTED" || r.status === "ROLLED_BACK" ? "bg-rose-100 text-rose-600" : "bg-gold-500/15 text-gold-600"}`}>{r.status.replaceAll("_", " ")}</span></td>
                    <td className="text-text-700">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td>{r.status === "APPROVED" && <button onClick={() => handleRollback(r.id)} className="btn-text text-rose-600">Roll back</button>}</td>
                  </tr>
                ))}
                {mergeRequests.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No merge requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
