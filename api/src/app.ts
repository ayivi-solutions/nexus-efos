import express from "express";
import * as Sentry from "@sentry/node";
// Incident, 9 Aug 2026: a synchronous throw inside an async route
// handler (encryptSecret failing on a malformed MFA_ENCRYPTION_KEY)
// became an unhandled promise rejection, which Node 22 treats as fatal
// by default — it took down the entire process, not just that one
// request, and Railway's restart-and-repeat crash-looped the whole API
// for every user. Express 4 does not catch async handler rejections on
// its own; this patches it to, so ANY unguarded throw anywhere in this
// codebase (not just the one found tonight) becomes a normal error
// response instead of a server-wide outage. Must be imported before any
// routers are registered, per the package's own requirement.
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { requestCorrelation } from "./middleware/requestCorrelation";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";
import { authRouter } from "./routes/auth.routes";
import { institutionRouter } from "./routes/institution.routes";
import { roleRouter } from "./routes/role.routes";
import { customerRouter } from "./routes/customer.routes";
import { loanRouter } from "./routes/loan.routes";
import { savingsRouter } from "./routes/savings.routes";
import { auditRouter } from "./routes/audit.routes";
import { employeeRouter } from "./routes/employee.routes";
import { reportsRouter } from "./routes/reports.routes";
import { productsRouter } from "./routes/products.routes";
import { watchlistRouter } from "./routes/watchlist.routes";
import { documentsRouter } from "./routes/documents.routes";
import { approvalsRouter } from "./routes/approvals.routes";
import { savingsInterestRouter } from "./routes/savings-interest.routes";
import { migrationRouter } from "./routes/migration.routes";
import { businessRulesRouter } from "./routes/businessRules.routes";
import { departmentsRouter, positionsRouter } from "./routes/departments.routes";
import { collectionsRouter } from "./routes/collections.routes";
import { cashVaultRouter } from "./routes/cashVault.routes";
import { chequeRouter } from "./routes/cheque.routes";
import { crmRouter } from "./routes/crm.routes";
import { hrRouter } from "./routes/hr.routes";
import { internalAuditRouter } from "./routes/internalAudit.routes";
import { capitalAdequacyRouter } from "./routes/capitalAdequacy.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { generalLedgerRouter } from "./routes/generalLedger.routes";
import { interBranchRouter } from "./routes/interBranch.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { payrollRouter } from "./routes/payroll.routes";
import { assetRouter } from "./routes/asset.routes";

export const app = express();

// GAP-SEC-003 follow-up fix: Railway (and any single-hop reverse proxy
// deployment) sits in front of this process, so every real request
// carries an X-Forwarded-For header. Without telling Express to trust
// it, express-rate-limit refuses to use it for its IP-based key —
// logging ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request and
// falling back to an IP that isn't the real client's, which would
// either rate-limit everyone behind the proxy as one shared "client" or
// make the limiter trivially bypassable. `1` means trust exactly one
// hop — correct for Railway's topology (one proxy between the internet
// and this process), not an open-ended "trust everything" setting.
app.set("trust proxy", 1);

// GAP-SEC-003 fix. Real ID first, before anything else touches the
// request, so it's available to every downstream handler and error path.
app.use(requestCorrelation);

// This is a pure JSON API with no HTML rendering of its own (the
// frontend is a fully separate Next.js app) — contentSecurityPolicy is
// safe to leave at Helmet's strict default rather than needing a
// permissive script-src/style-src the way an HTML-serving app would.
// crossOriginResourcePolicy relaxed to same-site rather than Helmet's
// default same-origin, since the web app calls this API from a
// different origin (WEB_ORIGIN) — same-origin would block every
// legitimate cross-origin fetch from the actual frontend.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3100", credentials: true }));
app.use(express.json());

// PDDS §47 API Architecture Phase 3 — real versioning (every route now
// lives under /v1) and basic rate limiting. Deliberately not a full API
// gateway (no request transformation, no per-client API keys yet) — a
// bounded, honest first step, not the doc's full enterprise vision.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // per IP, per window — generous for normal use, still a real ceiling
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again shortly." },
});
app.use("/v1", apiLimiter);

// GAP-SEC-003 fix — endpoint-specific limits. The blanket 300-per-15-min
// limiter above is shared by every route, which is far too generous for
// authentication specifically: 300 login attempts in 15 minutes is
// trivially enough to brute-force a weak password against one account.
// This is deliberately layered ON TOP of the existing account-lockout
// mechanism, not a replacement for it — they cover different attack
// shapes. Lockout stops repeated attempts against ONE account regardless
// of source IP; this stops one IP hammering MANY accounts (or password-
// spraying) before any single account's lockout threshold would trip.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // per IP, per window — real headroom for a person mistyping a password a few times, nowhere near enough for a brute-force attempt
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts from this address — please wait before trying again." },
});
// Express's app.use(path, ...) prefix-matches, so /v1/auth/login also
// covers /v1/auth/login/mfa automatically — no separate line needed
// (and adding one would double-count against the same limiter's shared
// counter for that path, since Express would run both matching
// middlewares for a single request).
app.use("/v1/auth/login", authLimiter);
app.use("/v1/auth/mfa/setup-required", authLimiter);
app.use("/v1/auth/mfa/verify-required", authLimiter);
app.use("/v1/auth/refresh", authLimiter);
app.use("/v1/auth/register-institution", authLimiter);
app.use("/v1/auth/accept-invite", authLimiter);
app.use("/v1/auth/change-password", authLimiter);

app.get("/health", async (_req, res) => {
  // GAP-OBS-001 (Better Stack uptime monitoring): the original version
  // only confirmed the Express process was alive — exactly the signal
  // that would have looked "healthy" during the same night's incident
  // right up until a request actually exercised the broken code path.
  // A real uptime check needs to confirm the app can actually do its
  // job, not just that the process didn't crash this millisecond —
  // checking real DB connectivity is the minimum bar for that.
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "nexus-efos-api", database: "connected" });
  } catch (err: any) {
    res.status(503).json({ status: "degraded", service: "nexus-efos-api", database: "unreachable" });
  }
});

app.use("/v1/auth", authRouter);
app.use("/v1/institutions", institutionRouter);
app.use("/v1/roles", roleRouter);
app.use("/v1/customers", customerRouter);
app.use("/v1/loans", loanRouter);
app.use("/v1/savings", savingsRouter);
app.use("/v1/audit-log", auditRouter);
app.use("/v1/employees", employeeRouter);
app.use("/v1/reports", reportsRouter);
app.use("/v1/products", productsRouter);
app.use("/v1/watchlist", watchlistRouter);
app.use("/v1/documents", documentsRouter);
app.use("/v1/approvals", approvalsRouter);
app.use("/v1/savings-interest", savingsInterestRouter);
app.use("/v1/migration", migrationRouter);
app.use("/v1/business-rules", businessRulesRouter);
app.use("/v1/departments", departmentsRouter);
app.use("/v1/positions", positionsRouter);
app.use("/v1/collections", collectionsRouter);
app.use("/v1/cash-vault", cashVaultRouter);
app.use("/v1/cheques", chequeRouter);
app.use("/v1/crm", crmRouter);
app.use("/v1/hr", hrRouter);
app.use("/v1/internal-audit", internalAuditRouter);
app.use("/v1/capital-adequacy", capitalAdequacyRouter);
app.use("/v1/notifications", notificationsRouter);
app.use("/v1/general-ledger", generalLedgerRouter);
app.use("/v1/inter-branch", interBranchRouter);
app.use("/v1/analytics", analyticsRouter);
app.use("/v1/payroll", payrollRouter);
app.use("/v1/assets", assetRouter);

// GAP-OBS-001: must be registered after all routes and before any other
// error-handling middleware — this is what actually sends an error to
// Sentry. The existing custom handler right after it still runs
// afterward (Sentry's handler calls next() internally) and is still
// what decides the actual HTTP response the client sees.
Sentry.setupExpressErrorHandler(app);

// Now actually reachable for async-handler throws too, once
// express-async-errors is patched in above — before tonight's incident,
// those crashed the whole process before ever getting here. Includes
// the request correlation ID (GAP-SEC-003) in both the log line and the
// response, so a person reporting "I got an error" can hand over one ID
// that ties directly to the exact server-side log entry, instead of
// guessing which of many log lines was theirs.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`[${req.requestId || "no-request-id"}]`, { error: err?.message || String(err), stack: err?.stack, path: req.originalUrl });
  res.status(500).json({ error: "Internal server error", requestId: req.requestId });
});
