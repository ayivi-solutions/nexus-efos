import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
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

app.get("/health", (_req, res) => res.json({ status: "ok", service: "nexus-efos-api" }));

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

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
