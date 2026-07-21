"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useErrorToast } from "@/components/Toast";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.acceptInvite({ token, password });
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

        {!token && (
          <p className="text-rose-600 text-sm">
            This link is missing an invite token. Ask an administrator for a fresh link from Roles &amp; Permissions.
          </p>
        )}

        {token && done && <p className="text-green-600 text-sm">Password set — redirecting to login…</p>}

        {token && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-[13px] text-text-500 mb-1.5">New password</span>
              <input required type="password" autoComplete="new-password" minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Saving…" : "Set password & continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
