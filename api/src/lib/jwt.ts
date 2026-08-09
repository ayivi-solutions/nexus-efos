import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface AccessTokenPayload {
  userId: string;
  institutionId: string;
  category: "INTERNAL" | "EXTERNAL";
}

// GAP-SEC-001 fix: these fallbacks now only apply outside production
// (gated by NODE_ENV, not just by whether the env var happens to be
// set) — defense in depth alongside validateProductionSecrets() in
// lib/startupSecrets.ts, which runs at boot before the server accepts
// any traffic. Even if module import order ever changed, a production
// process can no longer silently sign tokens with a string that's
// sitting in plain sight in this file.
const isProd = process.env.NODE_ENV === "production";
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || (isProd ? "" : "dev-access-secret");
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (isProd ? "" : "dev-refresh-secret");
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: ACCESS_TTL as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh tokens are random opaque strings, not JWTs — we store only their
// hash (doc §39: privileged/session controls, defence in depth). The raw
// token is returned to the client once and never persisted in plaintext.
export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(48).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { raw, hash, expiresAt };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// GAP-SEC-002 fix: the demo-link JWT namespace (and DEMO_LINK_SECRET)
// that used to live here is gone. It signed the plaintext password
// directly into a token anyone holding the link URL could decode
// without any secret — see routes/auth.routes.ts POST/GET /auth/demo-link
// for the real fix, which stores an encrypted password server-side
// against an opaque random token instead.

// MFA-pending tokens — issued after a correct password but before MFA is
// verified, so login becomes a real two-step exchange rather than a single
// call that just happens to check more things. Deliberately its own JWT
// namespace (same reasoning as demo-link tokens above): a leaked/expired
// MFA-pending token can never be mistaken for or exchanged as a real access
// token, and it can't be used for anything except finishing this one login.
const MFA_PENDING_SECRET = process.env.MFA_PENDING_SECRET || (isProd ? "" : "dev-mfa-pending-secret");

export interface MfaPendingPayload {
  userId: string;
}

export function signMfaPendingToken(payload: MfaPendingPayload, ttlSeconds: number): string {
  return jwt.sign(payload, MFA_PENDING_SECRET, { expiresIn: ttlSeconds });
}

export function verifyMfaPendingToken(token: string): MfaPendingPayload {
  return jwt.verify(token, MFA_PENDING_SECRET) as MfaPendingPayload;
}

export { REFRESH_SECRET };
