import express from "express";
import cors from "cors";
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

export const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3100", credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "nexus-efos-api" }));

app.use("/auth", authRouter);
app.use("/institutions", institutionRouter);
app.use("/roles", roleRouter);
app.use("/customers", customerRouter);
app.use("/loans", loanRouter);
app.use("/savings", savingsRouter);
app.use("/audit-log", auditRouter);
app.use("/employees", employeeRouter);
app.use("/reports", reportsRouter);
app.use("/products", productsRouter);
app.use("/watchlist", watchlistRouter);
app.use("/documents", documentsRouter);
app.use("/approvals", approvalsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
