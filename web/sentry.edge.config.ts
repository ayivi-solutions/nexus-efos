// GAP-OBS-001. Edge runtime — middleware.ts and anything running there.
// This app's own middleware, if any, is minimal (auth is handled per-
// request inside route handlers, not via Next.js middleware), but this
// file is still required for a complete instrumentation setup — a
// missing edge config produces the same "outdated configuration"
// warning at build time that a missing onRequestError hook does. See
// instrumentation.ts for how this file gets loaded.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
