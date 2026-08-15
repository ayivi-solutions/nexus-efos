// GAP-OBS-001 (Implementation Requirements Traceability & Remediation
// Register, 9 Aug 2026): "Production errors, performance, integrations,
// jobs and financial transactions shall be diagnosable using structured,
// correlated telemetry." Chosen the same night as a real incident that
// took the whole API down — Sentry is specifically built for "something
// crashed, tell me what and why," which is exactly what was missing that
// night beyond raw Railway logs.
//
// Must be the very first thing this process does — before any other
// module is required, including the app itself — so Sentry's own
// instrumentation can hook into everything that loads afterward. This is
// why server.ts imports this file as its literal first line, and why
// this file itself only does two things: load env vars, then init.
import "dotenv/config";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// No DSN configured (e.g. local development, or before the account is
// set up) — Sentry.init with an empty/undefined dsn is a documented,
// safe no-op; every Sentry.* call elsewhere in the app becomes silently
// inert rather than throwing. Nothing else needs to branch on whether
// this is configured.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  integrations: [nodeProfilingIntegration()],
  // Financial platform handling real customer PII (names, phone
  // numbers, loan amounts, account balances) in request bodies —
  // deliberately NOT Sentry's own suggested default of true. Stack
  // traces and error messages are still fully captured; what's
  // withheld is raw request/response body content and end-user IP/
  // header data that could contain sensitive financial or personal
  // information having no business leaving this infrastructure for a
  // third-party SaaS by default.
  sendDefaultPii: false,
  // 10% of transactions sampled for performance tracing in production —
  // enough to spot real trends without the ingest cost or PII exposure
  // surface of tracing every single request. 100% in development, where
  // volume is naturally low and full visibility while building is more
  // useful than sampling.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
