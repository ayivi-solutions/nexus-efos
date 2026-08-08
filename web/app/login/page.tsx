"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, persistSession, getDeviceFingerprint } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";
import { QRCodeSVG } from "qrcode.react";

// PDDS Phase 4 — login is a real multi-step exchange now:
//   "credentials" -> "mfa-code" (MFA already enrolled, needs the 6-digit/backup code)
//                 -> "mfa-setup-required" (a role mandates MFA, never enrolled — show QR, then verify)
// Each non-"credentials" step carries an mfaPendingToken proving the
// password step already passed, without a server session existing yet.
type LoginStep = "credentials" | "mfa-code" | "mfa-setup-required";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const demoToken = searchParams.get("demo");

  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaPendingToken, setMfaPendingToken] = useState("");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [setupSecret, setSetupSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [pendingSession, setPendingSession] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [loading, setLoading] = useState(false);
  // Distinct from `loading` (the sign-in submit spinner) — this covers the
  // brief window before we know whether to even show the form: either an
  // existing session is being checked, or a demo link is being resolved.
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Already signed in with a live session (token not expired, this isn't
    // an ?expired=1 bounce-back) — skip the form entirely and go straight
    // to the app, same as the person asked: "if they already login before,
    // they are taken to the Home screen."
    if (!expired && !demoToken && typeof window !== "undefined" && sessionStorage.getItem("nexus_access_token")) {
      api.whoAmI()
        .then(() => router.replace("/dashboard"))
        .catch(() => setCheckingSession(false));
      return;
    }
    // A shared demo link — resolve it server-side to the real credentials
    // it carries and pre-fill the form. The person still has to press
    // Sign In themselves; this only saves them typing.
    if (demoToken) {
      api.resolveDemoLink(demoToken)
        .then((creds: { email: string; password: string }) => {
          setEmail(creds.email);
          setPassword(creds.password);
          setCheckingSession(false);
        })
        .catch(() => {
          setError("This demo link is invalid or has expired. Ask for a new one.");
          setCheckingSession(false);
        });
      return;
    }
    setCheckingSession(false);
  }, [demoToken, expired, router]);

  function finishLogin(session: { accessToken: string; refreshToken: string }) {
    persistSession(session.accessToken, session.refreshToken);
    router.push("/dashboard");
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const deviceFingerprint = getDeviceFingerprint();
      const res = await api.login({ email, password, deviceFingerprint, trustDevice });
      if (res.mfaRequired) {
        setMfaPendingToken(res.mfaPendingToken);
        setStep("mfa-code");
      } else if (res.mfaSetupRequired) {
        setMfaPendingToken(res.mfaPendingToken);
        const setup = await api.mfaSetupRequired(res.mfaPendingToken);
        setSetupSecret(setup);
        setStep("mfa-setup-required");
      } else {
        finishLogin(res);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const deviceFingerprint = getDeviceFingerprint();
      const res = await api.loginMfa({ mfaPendingToken, code, deviceFingerprint, trustDevice });
      finishLogin(res);
    } catch (err: any) {
      setError(err.message || "Incorrect code");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSetupRequiredSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const deviceFingerprint = getDeviceFingerprint();
      const res = await api.mfaVerifyRequired({ mfaPendingToken, code, deviceFingerprint });
      // Show the backup codes once before finishing — losing them means
      // losing the only fallback if the authenticator app is ever lost.
      setBackupCodes(res.backupCodes);
      setPendingSession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    } catch (err: any) {
      setError(err.message || "Incorrect code");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) return null;

  if (backupCodes) {
    return (
      <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display font-semibold text-2xl text-paper-50 mb-2 text-center">Save your backup codes</h1>
          <p className="text-[13px] text-violet-500 mb-4 text-center">
            Each code works once, if you ever lose access to your authenticator app. Store these somewhere safe — they won&apos;t be shown again.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6 font-mono text-sm bg-ink-900 border border-ink-700 rounded-md p-4 text-gold-300">
            {backupCodes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => pendingSession && finishLogin(pendingSession)}
            className="w-full py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition"
          >
            I&apos;ve saved these — continue
          </button>
        </div>
      </main>
    );
  }

  if (step === "mfa-setup-required" && setupSecret) {
    return (
      <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
        <form onSubmit={handleMfaSetupRequiredSubmit} className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexus-icon-gold-on-dark-128.png" alt="Nexus EFOS" className="w-12 h-12 mx-auto mb-6 rounded-md" />
          <h1 className="font-display font-semibold text-2xl text-paper-50 mb-2 text-center">Set up two-factor authentication</h1>
          <p className="text-[13px] text-violet-500 mb-4 text-center">
            Your role requires this. Scan the QR code below with an authenticator app (Google Authenticator, Authy, etc.), or enter the key manually.
          </p>
          <div className="flex justify-center mb-4">
            <div className="rounded-md bg-white p-3">
              <QRCodeSVG value={setupSecret.otpauthUri} size={180} />
            </div>
          </div>
          <div className="mb-5 text-center">
            <span className="block text-[11px] text-violet-500 mb-1">Or enter this key manually</span>
            <code className="text-xs text-gold-300 break-all">{setupSecret.secret}</code>
          </div>
          <label className="block mb-5">
            <span className="block text-[13px] text-violet-500 mb-1.5">6-digit code from your app</span>
            <input
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md px-3 py-2.5 text-sm bg-ink-900 text-paper-50 border border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-400 text-center tracking-[0.3em]"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify and finish sign in"}
          </button>
        </form>
      </main>
    );
  }

  if (step === "mfa-code") {
    return (
      <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
        <form onSubmit={handleMfaCodeSubmit} className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexus-icon-gold-on-dark-128.png" alt="Nexus EFOS" className="w-12 h-12 mx-auto mb-6 rounded-md" />
          <h1 className="font-display font-semibold text-2xl text-paper-50 mb-2 text-center">Enter your code</h1>
          <p className="text-[13px] text-violet-500 mb-5 text-center">6-digit code from your authenticator app, or a backup code.</p>
          <label className="block mb-4">
            <input
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md px-3 py-2.5 text-sm bg-ink-900 text-paper-50 border border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-400 text-center tracking-[0.2em]"
            />
          </label>
          <label className="flex items-center gap-2 mb-5 text-[13px] text-violet-500">
            <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
            Trust this device for 30 days
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <form onSubmit={handleCredentialsSubmit} className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/nexus-icon-gold-on-dark-128.png"
          alt="Nexus EFOS"
          className="w-12 h-12 mx-auto mb-6 rounded-md"
        />
        <h1 className="font-display font-semibold text-2xl text-paper-50 mb-2 text-center">Sign in to Nexus EFOS</h1>

        {expired && (
          <div className="mb-5 px-4 py-3 rounded-md bg-gold-400/10 border border-gold-500/30 text-gold-300 text-[13px] text-center">
            Your session expired. Please sign in again.
          </div>
        )}

        <label className="block mb-3">
          <span className="block text-[13px] text-violet-500 mb-1.5">Email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md px-3 py-2.5 text-sm bg-ink-900 text-paper-50 border border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </label>
        <label className="block mb-5">
          <span className="block text-[13px] text-violet-500 mb-1.5">Password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md px-3 py-2.5 text-sm bg-ink-900 text-paper-50 border border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </label>

        
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
