"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, persistSession } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const demoToken = searchParams.get("demo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await api.login({ email, password });
      persistSession(session.accessToken, session.refreshToken);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) return null;

  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="font-mono text-xs tracking-[0.3em] text-gold-400 uppercase mb-6 text-center">NX</div>
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
