// GAP-SEC-001 (Implementation Requirements Traceability & Remediation
// Register, 9 Aug 2026): production services shall not start with
// known/default cryptographic secrets. Before this file, lib/jwt.ts
// fell back to hardcoded dev strings ("dev-access-secret" etc.) whenever
// the corresponding env var was unset — a misconfigured production
// deploy would silently sign real tokens with a string sitting in plain
// sight in this repo. Called once at boot, before app.listen(), so a
// bad production config fails the deploy instead of accepting traffic.
//
// Only enforced when NODE_ENV === "production" — local/dev environments
// keep the fallback convenience so `npm run dev` doesn't require every
// secret to be configured on every contributor's machine.

const DEV_FALLBACKS = new Set([
  "dev-access-secret",
  "dev-refresh-secret",
  "dev-demo-link-secret",
  "dev-mfa-pending-secret",
]);

const MIN_SECRET_LENGTH = 32; // matches the strength bar already documented for MFA_ENCRYPTION_KEY

interface RequiredSecret {
  envVar: string;
  purpose: string;
}

const REQUIRED_SECRETS: RequiredSecret[] = [
  { envVar: "JWT_ACCESS_SECRET", purpose: "access token signing" },
  { envVar: "JWT_REFRESH_SECRET", purpose: "refresh token signing" },
  { envVar: "MFA_PENDING_SECRET", purpose: "MFA-pending token signing" },
  { envVar: "MFA_ENCRYPTION_KEY", purpose: "MFA secret encryption (already fail-closed in lib/security.ts — checked again here so the failure surfaces at boot, not on first MFA enrollment)" },
];

export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  for (const { envVar, purpose } of REQUIRED_SECRETS) {
    const value = process.env[envVar];
    if (!value) {
      problems.push(`${envVar} is not set (needed for ${purpose}).`);
    } else if (DEV_FALLBACKS.has(value)) {
      problems.push(`${envVar} is set to a known development placeholder value — this must never run in production.`);
    } else if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${envVar} is only ${value.length} characters — needs to be at least ${MIN_SECRET_LENGTH} for adequate entropy. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure secrets:\n` + problems.map((p) => `  - ${p}`).join("\n")
    );
  }
}
