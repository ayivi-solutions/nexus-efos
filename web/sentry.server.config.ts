// GAP-OBS-001. Node.js runtime — Server Components, Route Handlers,
// Server Actions running on the actual Node process (as opposed to the
// Edge runtime, which needs its own separate init in sentry.edge.config.ts
// since it can't use Node-specific APIs). See instrumentation.ts for how
// this file gets loaded.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
