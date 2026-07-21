"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.acceptInvite({ email, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err: any) {
      setError(err.message || "Could not accept invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 p-6">
      <div className="w-full max-w-sm bg-paper-0 rounded-lg p-8">
        <h1 className="font-display font-semibold text-2xl text-ink-900 mb-1">Set your password</h1>
        <p className="text-text-muted text-sm mb-6">Accept your Nexus EFOS staff invite.</p>

        {done ? (
          <p className="text-green-600 text-sm">Password set — redirecting to login…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">Email</span>
              <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">New password</span>
              <input required type="password" minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2.5 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : "Set password & continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
