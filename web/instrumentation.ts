// GAP-OBS-001. Next.js's own instrumentation hook, not a Sentry-specific
// file — register() runs once when the server starts, before it accepts
// any requests. NEXT_RUNTIME distinguishes the actual Node.js process
// from Edge (middleware/edge routes), which needs a different init since
// it can't use Node-specific APIs.
//
// onRequestError is a separate, distinct hook (fires per-error, not
// once at startup) that current Sentry/Next.js versions require
// explicitly — without it, the Next build emits a warning that this
// configuration is outdated even though register() alone used to be
// sufficient in older versions. Both are needed for complete coverage.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
