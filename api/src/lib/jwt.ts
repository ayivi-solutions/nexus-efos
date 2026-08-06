import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface AccessTokenPayload {
  userId: string;
  institutionId: string;
  category: "INTERNAL" | "EXTERNAL";
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
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

// Demo-link tokens are a separate, deliberately isolated JWT namespace from
// real access tokens — signed with their own secret so a leaked/guessed
// demo link can never be mistaken for or exchanged as a real access token,
// and vice versa. See auth.routes.ts POST/GET /auth/demo-link and the
// isDemo gate on Institution in schema.prisma for the rest of the safety
// story — this file only handles the sign/verify mechanics.
const DEMO_LINK_SECRET = process.env.DEMO_LINK_SECRET || "dev-demo-link-secret";

export interface DemoLinkPayload {
  email: string;
  password: string;
}

export function signDemoLinkToken(payload: DemoLinkPayload): string {
  // Long-lived by design (a year) — this is a reusable link handed to
  // multiple prospective pilot contacts over time, not a one-time invite.
  // The normal 15-minute access token / 30-day refresh token lifecycle
  // still governs the actual session once someone signs in through it.
  return jwt.sign(payload, DEMO_LINK_SECRET, { expiresIn: "365d" });
}

export function verifyDemoLinkToken(token: string): DemoLinkPayload {
  return jwt.verify(token, DEMO_LINK_SECRET) as DemoLinkPayload;
}

export { REFRESH_SECRET };
