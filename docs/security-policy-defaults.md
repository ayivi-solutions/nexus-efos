# Security Policy Defaults (PDDS Phase 4 / ESS §26)

**Status: disclosed defaults pending your review — not sourced from any working document.**

The Enterprise Security Specification (ESS) and the ECD/EFS/ETAS all name the
categories a real security policy needs (password policy, MFA requirement,
session timeout, lockout policy, credential rotation) but none of them —
checked directly, all four documents, full text — contain a single concrete
numeric threshold. PDDS §034/§136 do give real table/column definitions
(`user_account`, `user_mfa`, `user_password_history`, `user_device`,
`user_login_history` and the security columns on `user_account`), which is
what the schema in `api/prisma/schema.prisma` is built from.

The values below are what the schema is currently *enforced* against, at the
application layer. They are an OWASP ASVS / NIST 800-63B–informed baseline,
picked the same way the KYC risk-scoring weights were: a sensible,
standard-practice default, explicitly flagged as needing review against your
actual institutional policy rather than presented as confirmed.

## Password policy

| Setting | Default | Note |
|---|---|---|
| Minimum length | 12 characters | NIST 800-63B baseline |
| Maximum length | 128 characters | prevents DoS via huge inputs, not a security control |
| Composition rules | none enforced | NIST 800-63B explicitly discourages forced upper/lower/digit/symbol rules in favour of length + breach-list checking — **tension flagged**: ESS §26.4 does list these as required categories. If regulatory expectation favours composition rules over length, this needs to change. |
| Password history | last 5 disallowed on reuse | enforced via `UserPasswordHistory` |
| Password expiration | 90 days | NIST's current guidance drops mandatory expiration entirely; kept here as a conservative default because BOG-regulated institutions commonly still expect periodic rotation. **This is the single default most likely to need your override.** |
| Storage | bcrypt/argon2 hash, unique salt | already implemented — `User.passwordHash` |

## Account lockout

| Setting | Default |
|---|---|
| Failed-attempt threshold | 5 |
| Lockout duration | 30 minutes (auto-unlock) |
| Tracking | `User.failedLoginCount`, `User.lastFailedLoginAt`, `User.lockedUntil` |

## MFA

| Setting | Default |
|---|---|
| Method | TOTP (RFC 6238) — the only method actually implemented |
| Enrollment | optional per user; enforceable per role (not yet wired to a role-level "require MFA" flag — future work) |
| Backup codes | one-time use, hashed like passwords |
| SMS / Email MFA | named in the enum for completeness, not implemented — no provider integration exists, same disclosed gap as SMS notifications elsewhere in the platform |

## Session

| Setting | Default |
|---|---|
| Access token | 15 minutes (already implemented, unchanged) |
| Refresh token | existing `RefreshToken` rotation, unchanged |
| No separate `UserSession` table | session timeout is handled by the existing access/refresh token design — a parallel session table would duplicate it |

## Device tracking

| Setting | Default |
|---|---|
| New device | logged to `UserDevice`, `trusted = false` by default |
| Trust | no automatic promotion to `trusted` built yet — would need a "verify via email/OTP" flow, not yet built |

## What this doesn't cover

- Role-level "require MFA" enforcement — schema supports it (`UserMfa` per
  user), but no route currently blocks login for a role that should require
  it.
- Device-trust verification flow (email/OTP confirmation of a new device).
- Any of this being wired into `auth.routes.ts` — this document covers the
  **schema and the intended policy values only**. Route-level enforcement is
  the next piece of work.
