import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-ink-950 via-ink-900 to-ink-700 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="font-mono text-xs tracking-[0.3em] text-gold-400 uppercase mb-4">
          Enterprise Concept Build · v0.1
        </div>
        <h1 className="font-display font-semibold text-5xl text-paper-50 mb-4">
          Nexus <span className="text-gold-400">EFOS</span>
        </h1>
        <p className="text-violet-500 text-[15px] leading-relaxed mb-10">
          Nexus Operating System for Inclusive Finance — core platform prototype:
          enterprise identity, RBAC and institution onboarding.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/onboarding"
            className="px-5 py-3 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition"
          >
            Register an Institution
          </Link>
          <Link
            href="/login"
            className="px-5 py-3 rounded-md border border-ink-line text-paper-50 font-semibold text-sm hover:bg-ink-800 transition"
            style={{ borderColor: "rgba(232,181,99,0.14)" }}
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
