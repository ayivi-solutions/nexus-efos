"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { OnboardingShell } from "@/components/OnboardingShell";

export default function OnboardingGoLivePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoLive() {
    setError(null);
    setLoading(true);
    try {
      await api.goLive();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not go live");
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell step={5} title="Ready to go live">
      <p className="text-text-700 text-[15px] leading-relaxed mb-8">
        Institution registered, branches added, staff invited. Going live activates the
        institution — its status moves from <span className="font-mono text-[13px]">PENDING_ONBOARDING</span> to{" "}
        <span className="font-mono text-[13px]">ACTIVE</span>, and everyone you invited can sign
        in once they accept.
      </p>

      {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => router.push("/onboarding/staff")}
          className="text-sm text-text-muted hover:text-text-700"
        >
          Back
        </button>
        <button
          onClick={handleGoLive}
          disabled={loading}
          className="px-6 py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
        >
          {loading ? "Activating…" : "Go live →"}
        </button>
      </div>
    </OnboardingShell>
  );
}
