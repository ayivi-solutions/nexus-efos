const STEPS = ["Institution", "Details", "Branches", "Staff", "Go Live"];

export function OnboardingShell({
  step,
  title,
  children,
}: {
  step: number; // 1-5
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper-0 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "active" : "pending";
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                    state === "done"
                      ? "bg-gold-500 text-ink-900"
                      : state === "active"
                      ? "bg-ink-900 text-gold-400"
                      : "bg-paper-100 text-text-muted"
                  }`}
                >
                  {state === "done" ? "✓" : n}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${n < step ? "bg-gold-500" : "bg-paper-100"}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-paper-0 border border-paper-100 rounded-lg p-8 shadow-sm">
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-rose-600 mb-2">
            Institution Onboarding · Step {step} of 5
          </div>
          <h1 className="font-display font-semibold text-3xl text-ink-900 mb-6">{title}</h1>
          {children}
        </div>

        <style jsx global>{`
          .input {
            width: 100%;
            border: 1px solid #ece4d4;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 14px;
            background: #fff;
          }
          .input:focus {
            outline: 2px solid #d59535;
            outline-offset: 1px;
          }
        `}</style>
      </div>
    </main>
  );
}
