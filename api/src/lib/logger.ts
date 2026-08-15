// GAP-OBS-001, Better Stack piece. Deliberately NOT a wholesale
// replacement of every console.log/console.error in the codebase —
// that's a large, low-value-per-hour undertaking to do in one pass
// tonight, and doing it carelessly risks introducing real bugs into
// working code purely for logging-format churn. This wraps
// @logtail/node with a safe no-op fallback (same pattern as Sentry's
// optional DSN — no token configured means every call here does
// nothing but the normal console output, not an error), and is wired
// into the two highest-value spots: the global error handler and
// scheduled-job failures. Broader adoption elsewhere in the codebase is
// a real, disclosed follow-on, not something this file claims to cover.
import { Logtail } from "@logtail/node";

const sourceToken = process.env.LOGTAIL_SOURCE_TOKEN;
const endpoint = process.env.LOGTAIL_INGESTING_HOST; // e.g. "https://xyz.betterstackdata.com" — from the Better Stack source setup page

const logtail = sourceToken ? new Logtail(sourceToken, endpoint ? { endpoint } : undefined) : null;

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    console.log(message, context || "");
    logtail?.info(message, context).catch(() => {}); // never let a logging-provider hiccup affect the actual request/job
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(message, context || "");
    logtail?.warn(message, context).catch(() => {});
  },
  error(message: string, context?: Record<string, unknown>) {
    console.error(message, context || "");
    logtail?.error(message, context).catch(() => {});
  },
};
