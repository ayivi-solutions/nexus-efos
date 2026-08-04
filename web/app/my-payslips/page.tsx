"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

export default function MyPayslipsPage() {
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [entries, setEntries] = useState<any[]>([]);
  const [taxCert, setTaxCert] = useState<any>(null);
  const [contribution, setContribution] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listMyPayslips().then((r) => setEntries(r.entries)).catch((e) => setError(e.message));
    api.getMyTaxCertificate().then(setTaxCert).catch(() => {});
    api.getMyContributionStatement().then(setContribution).catch(() => {});
  }, []);

  async function handleDownload(entryId: string) {
    setBusy(true); setError(null);
    try { await api.downloadMyPayslip(entryId); } catch (err: any) { setError(err.message || "Could not download payslip"); } finally { setBusy(false); }
  }

  return (
    <AppShell active="My Payslips">
      <div className="p-5 dt:p-10">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">My Payslips</h1>
        <p className="text-text-muted text-sm mb-6">doc §213 — your own payroll records only. Every view and download here is logged.</p>

        <div className="grid grid-cols-1 dt:grid-cols-2 gap-4 mb-8">
          {taxCert && (
            <div className="card p-5">
              <div className="font-medium text-[13px] text-text-900 mb-2">Tax Certificate — {taxCert.year}</div>
              <div className="text-[12.5px] text-text-700 space-y-1">
                <div>Payslips this year: {taxCert.payslipCount}</div>
                <div>Total Gross: GHS {taxCert.totalGross.toLocaleString()}</div>
                <div>Total PAYE Withheld: GHS {taxCert.totalPaye.toLocaleString()}</div>
              </div>
            </div>
          )}
          {contribution && (
            <div className="card p-5">
              <div className="font-medium text-[13px] text-text-900 mb-2">Contribution Statement — {contribution.year}</div>
              <div className="text-[12.5px] text-text-700 space-y-1">
                <div>Your SSNIT Contribution: GHS {contribution.totalSsnitEmployee.toLocaleString()}</div>
                <div>Employer SSNIT (Tier 1): GHS {contribution.totalSsnitEmployerTier1.toLocaleString()}</div>
                <div>Employer Tier 2: GHS {contribution.totalTier2Employer.toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>

        <h2 className="font-display font-semibold text-lg text-ink-900 mb-3">Payslip History</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm table-modern">
            <thead><tr><th>Date</th><th>Gross</th><th>Net</th><th></th></tr></thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.id}>
                  <td className="text-text-700">{new Date(e.createdAt).toLocaleDateString()}</td>
                  <td className="text-text-700">GHS {Number(e.grossPay).toLocaleString()}</td>
                  <td className="text-text-900 font-medium">GHS {Number(e.netPay).toLocaleString()}</td>
                  <td><button onClick={() => handleDownload(e.id)} disabled={busy} className="btn-text text-gold-600">Download</button></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={4} className="text-center text-text-muted text-sm py-8">No payslips available yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
