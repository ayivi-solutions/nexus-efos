"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, persistSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="font-mono text-xs tracking-[0.3em] text-gold-400 uppercase mb-6 text-center">NX</div>
        <h1 className="font-display font-semibold text-2xl text-paper-50 mb-6 text-center">Sign in to Nexus EFOS</h1>

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

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

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
