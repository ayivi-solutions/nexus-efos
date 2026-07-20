import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { institutionRouter } from "./routes/institution.routes";
import { roleRouter } from "./routes/role.routes";
import { customerRouter } from "./routes/customer.routes";
import { loanRouter } from "./routes/loan.routes";
import { savingsRouter } from "./routes/savings.routes";

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

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
