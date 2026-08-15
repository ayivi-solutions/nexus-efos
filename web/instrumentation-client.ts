// GAP-OBS-001. Current Next.js/Sentry convention as of this SDK version
// — instrumentation-client.ts replaces the older sentry.client.config.ts
// pattern. See api/src/instrument.ts for the fuller reasoning (chosen
// the night of a real production incident).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  // Same reasoning as the API side: a financial platform's browser
  // sessions can carry account numbers, loan amounts, and customer
  // names through the UI — deliberately not Sentry's own suggested
  // default of true for sendDefaultPii.
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Session replay off entirely, not just sampled down — a screen
  // recording of this specific app is closer to raw customer financial
  // data than a typical web app's replay would be, and the honest
  // default here is "don't capture it" rather than "capture it but
  // mask some fields and hope the masking is complete."
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
