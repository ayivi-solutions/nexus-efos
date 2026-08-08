// PDDS Phase 4 (User security fields) — policy constants and crypto
// helpers. Every threshold below is a disclosed OWASP ASVS / NIST 800-63B
// default, NOT sourced from the ESS or any other working document — see
// docs/security-policy-defaults.md for the full reasoning and the two
// named tensions (composition rules, mandatory expiry) worth your review.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSecret as generateTotpSecret, generate as generateTotpToken, verify as verifyTotpToken, generateURI as generateTotpURI } from "otplib";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HISTORY_DEPTH = 5;
export const PASSWORD_EXPIRY_DAYS = 90;
export const FAILED_ATTEMPT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MINUTES = 30;
export const BACKUP_CODE_COUNT = 10;
export const MFA_PENDING_TOKEN_TTL_SECONDS = 120;
// How long a device stays MFA-skip-eligible once trusted. Matches the
// existing 30-day refresh-token TTL default for consistency, not a value
// sourced from any working document — see the trust-model caveats on
// UserDevice in schema.prisma.
export const DEVICE_TRUST_DURATION_DAYS = 30;

export function passwordExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

export function lockoutExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
}

export function deviceTrustExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + DEVICE_TRUST_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// TOTP secret encryption at rest (ESS §26.5 — "Passwords shall never be
// stored in plaintext", applied here to the MFA secret for the same
// reason). AES-256-GCM, key from env, never derived or hardcoded.
// ---------------------------------------------------------------------------
const RAW_KEY = process.env.MFA_ENCRYPTION_KEY || "";

function getKey(): Buffer {
  if (!RAW_KEY) {
    throw new Error(
      "MFA_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and set it in the environment before any MFA enrollment happens."
    );
  }
  const key = Buffer.from(RAW_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be a 32-byte value, hex-encoded (64 hex characters).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv : authTag : ciphertext, all hex, colon-joined — self-contained so
  // decryption never needs a second lookup.
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, dataHex] = stored.split(":");
  if (!ivHex || !authTagHex || !dataHex) throw new Error("Malformed encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Backup codes — generated once, shown once (plaintext) at enrollment,
// stored only hashed (same bcrypt scheme as passwords). Each is single-use.
// ---------------------------------------------------------------------------
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-")
  );
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

export async function matchAndConsumeBackupCode(
  suppliedCode: string,
  hashedCodes: string[]
): Promise<{ matched: boolean; remaining: string[] }> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(suppliedCode.trim().toUpperCase(), hashedCodes[i])) {
      const remaining = [...hashedCodes];
      remaining.splice(i, 1);
      return { matched: true, remaining };
    }
  }
  return { matched: false, remaining: hashedCodes };
}

// ---------------------------------------------------------------------------
// Password validation — length only, deliberately no forced composition
// rules (NIST 800-63B). See docs/security-policy-defaults.md for the
// tension against ESS §26.4, which does ask for composition rules.
// ---------------------------------------------------------------------------
export function validatePasswordLength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export async function isPasswordReused(
  newPassword: string,
  historyHashes: string[]
): Promise<boolean> {
  for (const oldHash of historyHashes) {
    if (await bcrypt.compare(newPassword, oldHash)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) — otplib v13's functional API, default plugins
// (Noble crypto / Scure base32), no extra config required. `generate` and
// `verify` are async in this version — every caller here awaits them.
// ---------------------------------------------------------------------------
export function generateTotpSecretBase32(): string {
  return generateTotpSecret();
}

export async function generateTotpCode(secret: string): Promise<string> {
  return generateTotpToken({ secret });
}

export async function verifyTotpCode(token: string, secret: string): Promise<boolean> {
  const result = await verifyTotpToken({ token, secret });
  return result.valid;
}

export function totpEnrollmentUri(secret: string, accountEmail: string): string {
  return generateTotpURI({ issuer: "Nexus EFOS", label: accountEmail, secret });
}
