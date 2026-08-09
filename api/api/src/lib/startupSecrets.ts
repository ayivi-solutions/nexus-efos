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
//
// Real incident, 9 Aug 2026: the original version of this file checked
// every secret with the same generic "at least 32 characters" rule.
// That's the right bar for an HMAC signing key (any sufficiently long
// random string works), but MFA_ENCRYPTION_KEY isn't a signing key —
// it's used as a raw AES-256 key, which has a hard cryptographic
// requirement of exactly 32 bytes (64 hex characters), not just "long
// enough." A key that was ≥32 characters but not exactly 64 hex chars
// passed this file's old check, then crashed on the very first real
// request that called encryptSecret/decryptSecret — synchronously,
// inside an async handler, which Node 22 treats as an unhandled
// rejection and terminates the whole process over, not just that one
// request. That crash-looped the production API. This file's whole
// purpose is catching exactly this class of problem before it ever
// reaches a real request — it failed to, because the check itself
// wasn't actually as strict as the thing it was standing in for.

const DEV_FALLBACKS = new Set([
  "dev-access-secret",
  "dev-refresh-secret",
  "dev-demo-link-secret",
  "dev-mfa-pending-secret",
]);

const MIN_SECRET_LENGTH = 32; // adequate entropy bar for a signing-key secret — NOT used for MFA_ENCRYPTION_KEY, which has its own exact-format check below

interface RequiredSecret {
  envVar: string;
  purpose: string;
  // Optional secret-specific validator, for requirements the generic
  // length check can't express (like MFA_ENCRYPTION_KEY's exact byte
  // length). Returns an error string to report, or null if valid.
  validate?: (value: string) => string | null;
}

const HEX_64_PATTERN = /^[0-9a-f]{64}$/i;

const REQUIRED_SECRETS: RequiredSecret[] = [
  { envVar: "JWT_ACCESS_SECRET", purpose: "access token signing" },
  { envVar: "JWT_REFRESH_SECRET", purpose: "refresh token signing" },
  { envVar: "MFA_PENDING_SECRET", purpose: "MFA-pending token signing" },
  {
    envVar: "MFA_ENCRYPTION_KEY",
    purpose: "MFA secret encryption",
    // Matches lib/security.ts's actual requirement exactly, not a
    // looser generic-length approximation of it — this is the specific
    // check that was missing before the 9 Aug incident.
    validate: (value) =>
      HEX_64_PATTERN.test(value)
        ? null
        : `must be exactly 64 hex characters (32 bytes), got ${value.length} character(s). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
  },
];

export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  for (const { envVar, purpose, validate } of REQUIRED_SECRETS) {
    const value = process.env[envVar];
    if (!value) {
      problems.push(`${envVar} is not set (needed for ${purpose}).`);
      continue;
    }
    if (DEV_FALLBACKS.has(value)) {
      problems.push(`${envVar} is set to a known development placeholder value — this must never run in production.`);
      continue;
    }
    if (validate) {
      const problem = validate(value);
      if (problem) problems.push(`${envVar} ${problem}`);
      continue;
    }
    if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${envVar} is only ${value.length} characters — needs to be at least ${MIN_SECRET_LENGTH} for adequate entropy. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure secrets:\n` + problems.map((p) => `  - ${p}`).join("\n")
    );
  }
}

