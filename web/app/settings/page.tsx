"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useErrorToast, useToast } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";
import { QRCodeSVG } from "qrcode.react";

type MfaStep = "idle" | "setup" | "backup-codes";

export default function SettingsPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [me, setMe] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwBusy, setPwBusy] = useState(false);

  const [mfaStep, setMfaStep] = useState<MfaStep>("idle");
  const [setupSecret, setSetupSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  function load() {
    api.whoAmI().then((r: any) => setMe(r.user)).catch((e: any) => setError(e.message));
    api.listDevices().then((r: any) => setDevices(r.devices)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setPwBusy(true); setError(null);
    try {
      await api.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success("Password changed.");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      load();
    } catch (err: any) { setError(err.message || "Could not change password"); } finally { setPwBusy(false); }
  }

  async function handleStartMfaSetup() {
    setMfaBusy(true); setError(null);
    try {
      const res = await api.mfaSetup();
      setSetupSecret(res);
      setMfaStep("setup");
    } catch (err: any) { setError(err.message || "Could not start MFA setup"); } finally { setMfaBusy(false); }
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true); setError(null);
    try {
      const res = await api.mfaVerify(mfaCode);
      setBackupCodes(res.backupCodes);
      setMfaStep("backup-codes");
      setMfaCode("");
    } catch (err: any) { setError(err.message || "Incorrect code"); } finally { setMfaBusy(false); }
  }

  function handleFinishMfaSetup() {
    setMfaStep("idle");
    setSetupSecret(null);
    setBackupCodes([]);
    toast.success("Two-factor authentication enabled.");
    load();
  }

  async function handleDisableMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true); setError(null);
    try {
      await api.mfaDisable(disablePassword);
      toast.info("Two-factor authentication disabled.");
      setShowDisableForm(false);
      setDisablePassword("");
      load();
    } catch (err: any) { setError(err.message || "Incorrect password"); } finally { setMfaBusy(false); }
  }

  async function handleRevokeDevice(id: string) {
    if (!window.confirm("Forget this device? You'll need to re-verify it (and go through MFA again, if enrolled) next time you sign in from it.")) return;
    try {
      await api.revokeDevice(id);
      toast.success("Device removed.");
      load();
    } catch (err: any) { setError(err.message || "Could not remove device"); }
  }

  return (
    <AppShell active="Settings">
      <div className="p-5 dt:p-10 max-w-2xl">
        <h1 className="font-display font-semibold text-2xl dt:text-3xl text-ink-900 mb-1">Settings</h1>
        <p className="text-text-muted text-sm mb-8">Your own account — password, two-factor authentication, and devices you&apos;ve signed in from.</p>

        {me && (
          <div className="card p-5 mb-6">
            <h2 className="font-display font-semibold text-base text-ink-900 mb-3">Account</h2>
            <div className="text-[13px] text-text-700"><span className="text-text-muted">Name</span> — {me.fullName}</div>
            <div className="text-[13px] text-text-700"><span className="text-text-muted">Email</span> — {me.email}</div>
            {me.passwordChangedAt && (
              <div className="text-[12px] text-text-muted mt-2">
                Password last changed {new Date(me.passwordChangedAt).toLocaleDateString()}
                {me.passwordExpiresAt && ` · expires ${new Date(me.passwordExpiresAt).toLocaleDateString()}`}
              </div>
            )}
            {me.mustChangePassword && (
              <div className="mt-2 px-3 py-2 rounded-md bg-rose-500/10 text-rose-600 text-[12.5px]">Your password has expired — please change it below.</div>
            )}
          </div>
        )}

        {/* Change password */}
        <div className="card p-5 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Change password</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Current password</span>
              <input required type="password" autoComplete="current-password" className="input" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">New password</span>
              <input required type="password" autoComplete="new-password" minLength={12} className="input" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} />
              <span className="block text-[11px] text-text-muted mt-1">At least 12 characters. Can&apos;t match your current password or your last 5 passwords.</span>
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Confirm new password</span>
              <input required type="password" autoComplete="new-password" className="input" value={pwForm.confirmPassword} onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
            </label>
            <button type="submit" disabled={pwBusy} className="btn-primary">{pwBusy ? "Changing…" : "Change password"}</button>
          </form>
        </div>

        {/* Two-factor authentication */}
        <div className="card p-5 mb-6">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-4">Two-factor authentication</h2>

          {mfaStep === "idle" && me && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className={`badge ${me.mfaEnabled ? "bg-green-100 text-green-600" : "bg-text-muted/15 text-text-muted"}`}>
                  {me.mfaEnabled ? "Enabled" : "Not enabled"}
                </span>
                {!me.mfaEnabled && (
                  <button onClick={handleStartMfaSetup} disabled={mfaBusy} className="btn-primary !py-2">
                    {mfaBusy ? "Starting…" : "Set up"}
                  </button>
                )}
              </div>
              {!me.mfaEnabled && (
                <p className="text-[12.5px] text-text-muted mt-2">Adds a second step at login using an authenticator app (Google Authenticator, Authy, etc.). Your role may require this — check with your administrator.</p>
              )}
              {me.mfaEnabled && !showDisableForm && (
                <button onClick={() => setShowDisableForm(true)} className="btn-text text-rose-600 mt-2">Disable two-factor authentication</button>
              )}
              {me.mfaEnabled && showDisableForm && (
                <form onSubmit={handleDisableMfa} className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="block flex-1 min-w-[180px]">
                    <span className="block text-[13px] text-text-500 mb-1.5">Confirm your password to disable</span>
                    <input required type="password" autoComplete="current-password" className="input" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
                  </label>
                  <button type="submit" disabled={mfaBusy} className="btn-primary !bg-rose-500 hover:!bg-rose-400">{mfaBusy ? "Disabling…" : "Disable"}</button>
                  <button type="button" onClick={() => { setShowDisableForm(false); setDisablePassword(""); }} className="btn-text text-text-muted">Cancel</button>
                </form>
              )}
            </>
          )}

          {mfaStep === "setup" && setupSecret && (
            <form onSubmit={handleVerifyMfa}>
              <p className="text-[12.5px] text-text-muted mb-4">Scan this with your authenticator app, or enter the key manually, then enter the 6-digit code it shows.</p>
              <div className="flex justify-center mb-4">
                <div className="rounded-md bg-white p-3 border border-paper-100">
                  <QRCodeSVG value={setupSecret.otpauthUri} size={160} />
                </div>
              </div>
              <div className="mb-4 text-center">
                <span className="block text-[11px] text-text-muted mb-1">Or enter this key manually</span>
                <code className="text-xs text-ink-900 break-all">{setupSecret.secret}</code>
              </div>
              <label className="block mb-4">
                <span className="block text-[13px] text-text-500 mb-1.5">6-digit code</span>
                <input required inputMode="numeric" maxLength={6} className="input text-center tracking-[0.3em]" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={mfaBusy} className="btn-primary">{mfaBusy ? "Verifying…" : "Verify and enable"}</button>
                <button type="button" onClick={() => { setMfaStep("idle"); setSetupSecret(null); }} className="btn-text text-text-muted">Cancel</button>
              </div>
            </form>
          )}

          {mfaStep === "backup-codes" && (
            <>
              <p className="text-[12.5px] text-text-muted mb-3">Save these backup codes somewhere safe. Each works once, if you ever lose access to your authenticator app. They won&apos;t be shown again.</p>
              <div className="grid grid-cols-2 gap-2 mb-4 font-mono text-sm bg-paper-50 border border-paper-100 rounded-md p-4 text-ink-900">
                {backupCodes.map((c) => (<div key={c}>{c}</div>))}
              </div>
              <button onClick={handleFinishMfaSetup} className="btn-primary">I&apos;ve saved these — done</button>
            </>
          )}
        </div>

        {/* Trusted / recent devices */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-base text-ink-900 mb-1">Devices</h2>
          <p className="text-[12.5px] text-text-muted mb-4">Trust is based on a browser-supplied identifier, not a hardware-backed guarantee — clearing your browser storage resets it. Trusted devices skip the two-factor step at login for 30 days; password is still required every time regardless.</p>
          <div className="divide-y divide-paper-100">
            {devices.map((d: any) => {
              const isTrusted = d.trusted && d.trustedUntil && new Date(d.trustedUntil) > new Date();
              return (
                <div key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-[13px] text-text-900 font-medium">{d.deviceName || "Unnamed device"}</div>
                    <div className="text-[11.5px] text-text-muted">
                      Last seen {new Date(d.lastSeenAt).toLocaleDateString()}
                      {isTrusted && ` · trusted until ${new Date(d.trustedUntil).toLocaleDateString()}`}
                      {d.ipAddress && ` · ${d.ipAddress}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isTrusted && <span className="badge bg-green-100 text-green-600">Trusted</span>}
                    <button onClick={() => handleRevokeDevice(d.id)} className="btn-text text-rose-600">Forget</button>
                  </div>
                </div>
              );
            })}
            {devices.length === 0 && <p className="text-text-muted text-sm py-6 text-center">No device history yet.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
