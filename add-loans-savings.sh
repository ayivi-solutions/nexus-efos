#!/usr/bin/env bash
set -euo pipefail
# Run from ~/Documents/GitHub/nexus-efos, on develop.
# Adds Loans + Savings: models, backend routes, frontend pages.
# Full-file overwrites (not anchor patches) for the 5 changed files —
# safer than anchor matching, since content is already verified working.

mkdir -p api/prisma
cat > api/prisma/schema.prisma << 'FILE_EOF'
// Nexus EFOS — Core Platform schema
// Maps to doc §21 (Layer 1: Core Platform — Enterprise Identity, Security),
// §38 (User Role Architecture), §39 (Permission and Access Control Framework)

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["nexus"]
}

// ---------------------------------------------------------------------------
// INSTITUTIONS  (doc §14.3 — Financial Institutions)
// ---------------------------------------------------------------------------

enum InstitutionType {
  INDIVIDUAL_SUSU_OPERATOR
  MICROFINANCE_INSTITUTION
  SAVINGS_AND_LOANS_COMPANY
  CREDIT_UNION
  COOPERATIVE_SOCIETY
  RURAL_COMMUNITY_BANK
  AGENCY_BANKING_NETWORK
  DIGITAL_LENDING_INSTITUTION

  @@schema("nexus")
}

enum InstitutionStatus {
  PENDING_ONBOARDING
  ACTIVE
  SUSPENDED
  DEACTIVATED

  @@schema("nexus")
}

model Institution {
  id            String            @id @default(cuid())
  legalName     String
  tradingName   String?
  type          InstitutionType
  status        InstitutionStatus @default(PENDING_ONBOARDING)
  regulatorId   String?           // e.g. BoG license / registration number
  country       String            @default("GH")
  region        String?
  phone         String?
  email         String?
  onboardingStep Int              @default(1) // 1..5, drives onboarding wizard

  branches      Branch[]
  users         User[]
  roles         Role[]
  customers     Customer[]
  loans         Loan[]
  savingsAccounts SavingsAccount[]
  auditLogs     AuditLog[]

  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@map("institutions")
  @@schema("nexus")
}

model Branch {
  id            String       @id @default(cuid())
  institution   Institution  @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String
  name          String
  code          String
  region        String?
  isHeadOffice  Boolean      @default(false)

  userRoles     UserRole[]
  customers     Customer[]
  loans         Loan[]
  savingsAccounts SavingsAccount[]

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@unique([institutionId, code])
  @@map("branches")
  @@schema("nexus")
}

// ---------------------------------------------------------------------------
// USERS  (doc §38.5 — Internal / External user categories)
// ---------------------------------------------------------------------------

enum UserCategory {
  INTERNAL // employees
  EXTERNAL // customers, agents, partners, regulators, developers

  @@schema("nexus")
}

enum UserStatus {
  INVITED
  ACTIVE
  SUSPENDED
  DEACTIVATED

  @@schema("nexus")
}

model User {
  id            String        @id @default(cuid())
  institution   Institution   @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String

  fullName      String
  email         String
  phone         String?
  passwordHash  String
  category      UserCategory  @default(INTERNAL)
  status        UserStatus    @default(INVITED)
  mfaEnabled    Boolean       @default(false)

  userRoles     UserRole[]
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]

  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([institutionId, email])
  @@map("users")
  @@schema("nexus")
}

// ---------------------------------------------------------------------------
// RBAC  (doc §38 User Role Architecture, §39 Permission and Access Control)
// ---------------------------------------------------------------------------

enum RoleCategory {
  EXECUTIVE
  OPERATIONAL
  GOVERNANCE
  TECHNICAL
  CUSTOMER

  @@schema("nexus")
}

model Role {
  id            String        @id @default(cuid())
  institution   Institution?  @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String?       // null = system/global template role
  name          String
  category      RoleCategory
  description   String?
  isSystem      Boolean       @default(false) // seeded template vs institution-defined

  rolePermissions RolePermission[]
  userRoles       UserRole[]

  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([institutionId, name])
  @@map("roles")
  @@schema("nexus")
}

// doc §39.6 — Data / Transaction / Administrative / Reporting / Integration
enum PermissionCategory {
  DATA
  TRANSACTION
  ADMINISTRATIVE
  REPORTING
  INTEGRATION

  @@schema("nexus")
}

// doc §38.9 — View, Create, Update, Delete, Approve, Reject, Export, Configure, Administer, Audit
enum PermissionAction {
  VIEW
  CREATE
  UPDATE
  DELETE
  APPROVE
  REJECT
  EXPORT
  CONFIGURE
  ADMINISTER
  AUDIT

  @@schema("nexus")
}

model Permission {
  id        String              @id @default(cuid())
  code      String              @unique // e.g. "loans.approve", "users.administer"
  category  PermissionCategory
  action    PermissionAction
  resource  String              // e.g. "loans", "savings", "users", "reports"
  description String?

  rolePermissions RolePermission[]

  @@map("permissions")
  @@schema("nexus")
}

model RolePermission {
  id           String     @id @default(cuid())
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  roleId       String
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  permissionId String

  @@unique([roleId, permissionId])
  @@map("role_permissions")
  @@schema("nexus")
}

// doc §38.12 — Temporary Delegation: time-limited, auto-expiring role assignment
model UserRole {
  id            String    @id @default(cuid())
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId        String
  role          Role      @relation(fields: [roleId], references: [id], onDelete: Cascade)
  roleId        String
  branch        Branch?   @relation(fields: [branchId], references: [id], onDelete: SetNull)
  branchId      String?   // resource-level scoping (doc §39.8)

  isDelegated   Boolean   @default(false)
  delegatedFromUserId String?
  startsAt      DateTime  @default(now())
  expiresAt     DateTime? // null = permanent

  createdAt     DateTime  @default(now())

  @@unique([userId, roleId, branchId])
  @@map("user_roles")
  @@schema("nexus")
}

// ---------------------------------------------------------------------------
// CUSTOMER LIFECYCLE MANAGEMENT (doc §33)
// ---------------------------------------------------------------------------

enum CustomerSegment {
  INDIVIDUAL
  BUSINESS
  FARMER_GROUP
  WOMENS_GROUP
  YOUTH
  CORPORATE

  @@schema("nexus")
}

enum LifecycleStage {
  AWARENESS
  ACQUISITION
  ONBOARDING
  ACTIVATION
  GROWTH
  RETENTION
  ADVOCACY
  RE_ENGAGEMENT

  @@schema("nexus")
}

enum KycStatus {
  PENDING
  VERIFIED
  REJECTED

  @@schema("nexus")
}

model Customer {
  id            String          @id @default(cuid())
  institution   Institution     @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String
  branch        Branch?         @relation(fields: [branchId], references: [id], onDelete: SetNull)
  branchId      String?

  fullName      String
  phone         String
  email         String?
  idType        String?
  idNumber      String?

  segment       CustomerSegment @default(INDIVIDUAL)
  lifecycleStage LifecycleStage @default(ONBOARDING)
  kycStatus     KycStatus       @default(PENDING)

  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  loans         Loan[]
  savingsAccounts SavingsAccount[]

  @@unique([institutionId, phone])
  @@map("customers")
  @@schema("nexus")
}

// ---------------------------------------------------------------------------
// LOANS (doc §34 Loan Management Service)
// ---------------------------------------------------------------------------

enum LoanStatus {
  PENDING
  APPROVED
  REJECTED
  DISBURSED
  ACTIVE
  CLOSED
  DEFAULTED

  @@schema("nexus")
}

model Loan {
  id            String      @id @default(cuid())
  institution   Institution @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String
  customer      Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerId    String
  branch        Branch?     @relation(fields: [branchId], references: [id], onDelete: SetNull)
  branchId      String?

  principal     Decimal     @db.Decimal(14, 2)
  interestRate  Decimal     @db.Decimal(5, 2)
  termMonths    Int
  status        LoanStatus  @default(PENDING)

  initiatedById String?
  approvedById  String?
  disbursedAt   DateTime?

  repayments    LoanRepayment[]

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@map("loans")
  @@schema("nexus")
}

model LoanRepayment {
  id           String   @id @default(cuid())
  loan         Loan     @relation(fields: [loanId], references: [id], onDelete: Cascade)
  loanId       String
  amount       Decimal  @db.Decimal(14, 2)
  paidAt       DateTime @default(now())
  recordedById String?

  @@map("loan_repayments")
  @@schema("nexus")
}

// ---------------------------------------------------------------------------
// SAVINGS (doc §34 Savings Account Service, Deposit Processing Service)
// ---------------------------------------------------------------------------

enum SavingsAccountStatus {
  ACTIVE
  DORMANT
  CLOSED

  @@schema("nexus")
}

enum SavingsTxnType {
  DEPOSIT
  WITHDRAWAL

  @@schema("nexus")
}

model SavingsAccount {
  id            String               @id @default(cuid())
  institution   Institution          @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String
  customer      Customer             @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerId    String
  branch        Branch?              @relation(fields: [branchId], references: [id], onDelete: SetNull)
  branchId      String?

  accountNumber String               @unique
  balance       Decimal              @default(0) @db.Decimal(14, 2)
  status        SavingsAccountStatus @default(ACTIVE)

  transactions  SavingsTransaction[]

  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@map("savings_accounts")
  @@schema("nexus")
}

model SavingsTransaction {
  id           String         @id @default(cuid())
  account      SavingsAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  accountId    String
  type         SavingsTxnType
  amount       Decimal        @db.Decimal(14, 2)
  balanceAfter Decimal        @db.Decimal(14, 2)
  recordedById String?
  createdAt    DateTime       @default(now())

  @@map("savings_transactions")
  @@schema("nexus")
}

// ---------------------------------------------------------------------------
// AUTH SUPPORT
// ---------------------------------------------------------------------------

model RefreshToken {
  id          String   @id @default(cuid())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String
  tokenHash   String   @unique
  userAgent   String?
  ipAddress   String?
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  @@map("refresh_tokens")
  @@schema("nexus")
}

// doc §39.13 — Access Monitoring: every access event should be monitored
model AuditLog {
  id            String      @id @default(cuid())
  institution   Institution @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  institutionId String
  user          User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  userId        String?
  action        String      // e.g. "auth.login", "role.assign", "loan.approve"
  resource      String?
  resourceId    String?
  metadata      Json?
  ipAddress     String?
  createdAt     DateTime    @default(now())

  @@map("audit_logs")
  @@schema("nexus")
}
FILE_EOF
echo 'Wrote: api/prisma/schema.prisma'

mkdir -p api/src
cat > api/src/app.ts << 'FILE_EOF'
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
FILE_EOF
echo 'Wrote: api/src/app.ts'

mkdir -p web/lib
cat > web/lib/api.ts << 'FILE_EOF'
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100";

async function request(path: string, options: RequestInit = {}) {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  registerInstitution: (data: {
    legalName: string;
    tradingName?: string;
    type: string;
    adminFullName: string;
    adminEmail: string;
    adminPassword: string;
  }) => request("/auth/register-institution", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  me: () => request("/institutions/me"),

  updateDetails: (data: { regulatorId?: string; region?: string; phone?: string; email?: string }) =>
    request("/institutions/onboarding/details", { method: "PATCH", body: JSON.stringify(data) }),

  addBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/onboarding/branches", { method: "POST", body: JSON.stringify(data) }),

  listRoles: () => request("/roles"),

  inviteStaff: (data: { fullName: string; email: string; roleId: string; branchId?: string }) =>
    request("/institutions/onboarding/staff", { method: "POST", body: JSON.stringify(data) }),

  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),

  listCustomers: () => request("/customers"),

  createCustomer: (data: { fullName: string; phone: string; email?: string; segment: string }) =>
    request("/customers", { method: "POST", body: JSON.stringify(data) }),

  listLoans: () => request("/loans"),
  createLoan: (data: { customerId: string; principal: number; interestRate: number; termMonths: number }) =>
    request("/loans", { method: "POST", body: JSON.stringify(data) }),
  approveLoan: (id: string) => request(`/loans/${id}/approve`, { method: "POST" }),
  rejectLoan: (id: string) => request(`/loans/${id}/reject`, { method: "POST" }),
  disburseLoan: (id: string) => request(`/loans/${id}/disburse`, { method: "POST" }),

  listSavingsAccounts: () => request("/savings"),
  openSavingsAccount: (data: { customerId: string }) =>
    request("/savings", { method: "POST", body: JSON.stringify(data) }),
  depositSavings: (id: string, amount: number) =>
    request(`/savings/${id}/deposit`, { method: "POST", body: JSON.stringify({ amount }) }),
  withdrawSavings: (id: string, amount: number) =>
    request(`/savings/${id}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) }),
};

// NOTE: sessionStorage is used here (client-only, in-memory-per-tab) rather
// than any persistent browser storage mechanism. In production this should
// move to an httpOnly cookie set by the API.
export function persistSession(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("nexus_access_token", accessToken);
  sessionStorage.setItem("nexus_refresh_token", refreshToken);
}
FILE_EOF
echo 'Wrote: web/lib/api.ts'

mkdir -p web/app/customers
cat > web/app/customers/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];

const STAGE_COLOR: Record<string, string> = {
  ONBOARDING: "bg-violet-500/15 text-violet-500",
  ACTIVATION: "bg-gold-500/15 text-gold-600",
  GROWTH: "bg-green-100 text-green-600",
  RETENTION: "bg-green-100 text-green-600",
  ADVOCACY: "bg-green-100 text-green-600",
  RE_ENGAGEMENT: "bg-rose-100 text-rose-600",
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .listCustomers()
      .then((res) => setCustomers(res.customers))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createCustomer(form);
      setForm({ fullName: "", phone: "", email: "", segment: "INDIVIDUAL" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-paper-0">
      <Sidebar active="Customers" />
      <main className="flex-1 p-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-semibold text-3xl text-ink-900">Customers</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
          >
            {showForm ? "Cancel" : "+ New customer"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Full name</span>
                <input
                  required
                  className="input"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Phone</span>
                <input
                  required
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Email (optional)</span>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Segment</span>
                <select
                  className="input"
                  value={form.segment}
                  onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                >
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : "Create customer"}
            </button>
          </form>
        )}

        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">KYC</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-900">{c.fullName}</td>
                  <td className="px-4 py-3 text-text-700">{c.phone}</td>
                  <td className="px-4 py-3 text-text-700">{c.segment.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STAGE_COLOR[c.lifecycleStage] || ""}`}>
                      {c.lifecycleStage.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-500">{c.kycStatus}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/app/customers/page.tsx'

mkdir -p web/app/dashboard
cat > web/app/dashboard/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

export default function DashboardPage() {
  const router = useRouter();
  const [institution, setInstitution] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("nexus_access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    api
      .me()
      .then((res) => setInstitution(res.institution))
      .catch((err) => setError(err.message));
  }, [router]);

  return (
    <div className="min-h-screen flex bg-paper-0">
      <Sidebar active="Overview" />

      <main className="flex-1 p-10">
        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}
        {!institution && !error && <p className="text-text-muted text-sm">Loading institution…</p>}

        {institution && (
          <>
            <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-rose-600 mb-2">
              {institution.type.replaceAll("_", " ")}
            </div>
            <h1 className="font-display font-semibold text-4xl text-ink-900 mb-8">{institution.legalName}</h1>

            {institution.onboardingStep < 5 && (
              <button
                onClick={() =>
                  router.push(
                    ["", "onboarding", "onboarding/details", "onboarding/branches", "onboarding/staff", "onboarding/go-live"][
                      institution.onboardingStep
                    ]
                  )
                }
                className="mb-8 w-full text-left px-4 py-3 rounded-md bg-gold-300/30 border border-gold-500/40 text-ink-900 text-sm hover:bg-gold-300/50 transition"
              >
                Onboarding is at step {institution.onboardingStep} of 5 — continue setup →
              </button>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <Stat label="Onboarding step" value={`${institution.onboardingStep} / 5`} />
              <Stat label="Status" value={institution.status.replaceAll("_", " ")} />
              <Stat label="Branches" value={String(institution.branches?.length ?? 0)} />
              <Stat label="Region" value={institution.region || "—"} />
            </div>

            <div className="border border-paper-100 rounded-lg p-6">
              <h2 className="font-display font-semibold text-lg text-ink-900 mb-2">Core platform prototype</h2>
              <p className="text-text-700 text-[15px] leading-relaxed">
                Auth, RBAC and institution onboarding are live. Next up per the roadmap: complete
                onboarding steps 2–5 (details, branches, staff invites, go-live) in the UI, then
                Enterprise Services (§21 Layer 2) — Customer Management, Savings, Loans.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-50 border border-paper-100 rounded-md p-3.5">
      <div className="font-display font-semibold text-xl text-gold-600">{value}</div>
      <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/app/dashboard/page.tsx'

mkdir -p api/src/routes
cat > api/src/routes/loan.routes.ts << 'FILE_EOF'
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const loanRouter = Router();
loanRouter.use(requireAuth);

loanRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const loans = await prisma.loan.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { customer: { select: { fullName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ loans });
});

const createSchema = z.object({
  customerId: z.string(),
  principal: z.number().positive(),
  interestRate: z.number().min(0),
  termMonths: z.number().int().positive(),
  branchId: z.string().optional(),
});

// doc §38.11 segregation of duties: initiating officer != approving officer,
// enforced at the approve step, not here.
loanRouter.post("/", requirePermission("loans.initiate"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const loan = await prisma.loan.create({
    data: {
      institutionId: req.auth!.institutionId,
      initiatedById: req.auth!.userId,
      ...parsed.data,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.initiate",
      resource: "loan",
      resourceId: loan.id,
    },
  });

  res.status(201).json({ loan });
});

loanRouter.post("/:id/approve", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  if (loan.initiatedById === req.auth!.userId) {
    return res.status(403).json({ error: "Segregation of duties: cannot approve a loan you initiated" });
  }

  const updated = await prisma.loan.update({
    where: { id: loan.id },
    data: { status: "APPROVED", approvedById: req.auth!.userId },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.approve",
      resource: "loan",
      resourceId: loan.id,
    },
  });

  res.json({ loan: updated });
});

loanRouter.post("/:id/reject", requirePermission("loans.reject"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "REJECTED" },
  });
  if (loan.count === 0) return res.status(404).json({ error: "Loan not found" });
  res.json({ ok: true });
});

loanRouter.post("/:id/disburse", requirePermission("loans.approve"), async (req: AuthedRequest, res) => {
  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });
  if (loan.status !== "APPROVED") return res.status(400).json({ error: "Loan must be APPROVED before disbursement" });

  const updated = await prisma.loan.update({
    where: { id: loan.id },
    data: { status: "DISBURSED", disbursedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "loan.disburse",
      resource: "loan",
      resourceId: loan.id,
    },
  });

  res.json({ loan: updated });
});

const repaymentSchema = z.object({ amount: z.number().positive() });

loanRouter.post("/:id/repayments", requirePermission("collections.record"), async (req: AuthedRequest, res) => {
  const parsed = repaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const loan = await prisma.loan.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!loan) return res.status(404).json({ error: "Loan not found" });

  const repayment = await prisma.loanRepayment.create({
    data: { loanId: loan.id, amount: parsed.data.amount, recordedById: req.auth!.userId },
  });

  if (loan.status === "DISBURSED") {
    await prisma.loan.update({ where: { id: loan.id }, data: { status: "ACTIVE" } });
  }

  res.status(201).json({ repayment });
});
FILE_EOF
echo 'Wrote: api/src/routes/loan.routes.ts'

mkdir -p api/src/routes
cat > api/src/routes/savings.routes.ts << 'FILE_EOF'
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const savingsRouter = Router();
savingsRouter.use(requireAuth);

savingsRouter.get("/", requirePermission("reports.view"), async (req: AuthedRequest, res) => {
  const accounts = await prisma.savingsAccount.findMany({
    where: { institutionId: req.auth!.institutionId },
    include: { customer: { select: { fullName: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ accounts });
});

function generateAccountNumber() {
  return "SA" + Date.now().toString().slice(-10);
}

const openSchema = z.object({ customerId: z.string(), branchId: z.string().optional() });

savingsRouter.post("/", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.create({
    data: {
      institutionId: req.auth!.institutionId,
      accountNumber: generateAccountNumber(),
      ...parsed.data,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "savings.open_account",
      resource: "savings_account",
      resourceId: account.id,
    },
  });

  res.status(201).json({ account });
});

const txnSchema = z.object({ amount: z.number().positive() });

savingsRouter.post("/:id/deposit", requirePermission("savings.initiate"), async (req: AuthedRequest, res) => {
  const parsed = txnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });

  const newBalance = Number(account.balance) + parsed.data.amount;

  const [updated, txn] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance } }),
    prisma.savingsTransaction.create({
      data: {
        accountId: account.id,
        type: "DEPOSIT",
        amount: parsed.data.amount,
        balanceAfter: newBalance,
        recordedById: req.auth!.userId,
      },
    }),
  ]);

  res.status(201).json({ account: updated, transaction: txn });
});

savingsRouter.post("/:id/withdraw", requirePermission("savings.approve"), async (req: AuthedRequest, res) => {
  const parsed = txnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const account = await prisma.savingsAccount.findFirst({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (Number(account.balance) < parsed.data.amount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  const newBalance = Number(account.balance) - parsed.data.amount;

  const [updated, txn] = await prisma.$transaction([
    prisma.savingsAccount.update({ where: { id: account.id }, data: { balance: newBalance } }),
    prisma.savingsTransaction.create({
      data: {
        accountId: account.id,
        type: "WITHDRAWAL",
        amount: parsed.data.amount,
        balanceAfter: newBalance,
        recordedById: req.auth!.userId,
      },
    }),
  ]);

  res.status(201).json({ account: updated, transaction: txn });
});
FILE_EOF
echo 'Wrote: api/src/routes/savings.routes.ts'

mkdir -p web/components
cat > web/components/Sidebar.tsx << 'FILE_EOF'
"use client";

import { useRouter } from "next/navigation";

const NAV = [
  { label: "Overview", icon: "◆", href: "/dashboard" },
  { label: "Customers", icon: "○", href: "/customers" },
  { label: "Loans", icon: "▢", href: "/loans" },
  { label: "Savings", icon: "▣", href: "/savings" },
  { label: "Branches", icon: "▤", href: "#" },
  { label: "Roles & Permissions", icon: "◈", href: "#" },
  { label: "Audit Log", icon: "▥", href: "#" },
];

export function Sidebar({ active }: { active: string }) {
  const router = useRouter();
  return (
    <aside className="w-[260px] bg-ink-900 text-paper-50 flex flex-col shrink-0">
      <div className="h-14 flex items-center gap-2 px-5 border-b" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
        <span className="w-2 h-2 rounded-full bg-gold-400" style={{ boxShadow: "0 0 8px #E8B563" }} />
        <span className="font-mono text-sm tracking-wide">
          NEXUS <b className="text-gold-400">EFOS</b>
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => (
          <button
            key={item.label}
            onClick={() => item.href !== "#" && router.push(item.href)}
            className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-md text-[13px] transition ${
              item.label === active
                ? "bg-ink-800 text-gold-300 shadow-[inset_2px_0_0_#E8B563]"
                : "text-violet-500 hover:bg-ink-800 hover:text-paper-50"
            }`}
          >
            <span className="text-gold-500">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t text-[11px] text-violet-500" style={{ borderColor: "rgba(232,181,99,0.14)" }}>
        Core Platform · Working Draft v0.1
      </div>
    </aside>
  );
}
FILE_EOF
echo 'Wrote: web/components/Sidebar.tsx'

mkdir -p web/app/loans
cat > web/app/loans/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-violet-500/15 text-violet-500",
  APPROVED: "bg-gold-500/15 text-gold-600",
  REJECTED: "bg-rose-100 text-rose-600",
  DISBURSED: "bg-green-100 text-green-600",
  ACTIVE: "bg-green-100 text-green-600",
  CLOSED: "bg-paper-100 text-text-muted",
  DEFAULTED: "bg-rose-100 text-rose-600",
};

export default function LoansPage() {
  const router = useRouter();
  const [loans, setLoans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: "", principal: "", interestRate: "", termMonths: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.listLoans().then((res) => setLoans(res.loans)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createLoan({
        customerId: form.customerId,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        termMonths: Number(form.termMonths),
      });
      setForm({ customerId: "", principal: "", interestRate: "", termMonths: "" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create loan");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject" | "disburse") {
    setError(null);
    try {
      if (action === "approve") await api.approveLoan(id);
      if (action === "reject") await api.rejectLoan(id);
      if (action === "disburse") await api.disburseLoan(id);
      load();
    } catch (err: any) {
      setError(err.message || "Action failed");
    }
  }

  return (
    <div className="min-h-screen flex bg-paper-0">
      <Sidebar active="Loans" />
      <main className="flex-1 p-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-semibold text-3xl text-ink-900">Loans</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
          >
            {showForm ? "Cancel" : "+ New loan"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
                <select
                  required
                  className="input"
                  value={form.customerId}
                  onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Principal (GHS)</span>
                <input
                  required
                  type="number"
                  min="1"
                  className="input"
                  value={form.principal}
                  onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Interest rate (% p.a.)</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.1"
                  className="input"
                  value={form.interestRate}
                  onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] text-text-500 mb-1.5">Term (months)</span>
                <input
                  required
                  type="number"
                  min="1"
                  className="input"
                  value={form.termMonths}
                  onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving || !customers.length}
              className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : "Initiate loan"}
            </button>
            {!customers.length && (
              <p className="text-text-muted text-xs mt-2">Add a customer first.</p>
            )}
          </form>
        )}

        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Principal</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 text-text-900">{l.customer?.fullName}</td>
                  <td className="px-4 py-3 text-text-700">GHS {Number(l.principal).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-700">{l.interestRate}%</td>
                  <td className="px-4 py-3 text-text-700">{l.termMonths}mo</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[l.status] || ""}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    {l.status === "PENDING" && (
                      <>
                        <button onClick={() => handleAction(l.id, "approve")} className="text-[12px] text-green-600 hover:underline">
                          Approve
                        </button>
                        <button onClick={() => handleAction(l.id, "reject")} className="text-[12px] text-rose-600 hover:underline">
                          Reject
                        </button>
                      </>
                    )}
                    {l.status === "APPROVED" && (
                      <button onClick={() => handleAction(l.id, "disburse")} className="text-[12px] text-gold-600 hover:underline">
                        Disburse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-sm">
                    No loans yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/app/loans/page.tsx'

mkdir -p web/app/savings
cat > web/app/savings/page.tsx << 'FILE_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

export default function SavingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [txnAmount, setTxnAmount] = useState<Record<string, string>>({});

  function load() {
    api.listSavingsAccounts().then((res) => setAccounts(res.accounts)).catch((err) => setError(err.message));
    api.listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  }

  useEffect(() => {
    if (!sessionStorage.getItem("nexus_access_token")) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.openSavingsAccount({ customerId: newCustomerId });
      setNewCustomerId("");
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not open account");
    } finally {
      setSaving(false);
    }
  }

  async function handleTxn(id: string, kind: "deposit" | "withdraw") {
    const amount = Number(txnAmount[id]);
    if (!amount || amount <= 0) return;
    setError(null);
    try {
      if (kind === "deposit") await api.depositSavings(id, amount);
      else await api.withdrawSavings(id, amount);
      setTxnAmount((t) => ({ ...t, [id]: "" }));
      load();
    } catch (err: any) {
      setError(err.message || "Transaction failed");
    }
  }

  return (
    <div className="min-h-screen flex bg-paper-0">
      <Sidebar active="Savings" />
      <main className="flex-1 p-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-semibold text-3xl text-ink-900">Savings</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 rounded-md bg-ink-900 text-gold-400 font-semibold text-sm hover:bg-ink-800 transition"
          >
            {showForm ? "Cancel" : "+ Open account"}
          </button>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {showForm && (
          <form onSubmit={handleOpen} className="border border-paper-100 rounded-lg p-6 mb-8 bg-paper-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <label className="block col-span-2">
                <span className="block text-[13px] text-text-500 mb-1.5">Customer</span>
                <select
                  required
                  className="input"
                  value={newCustomerId}
                  onChange={(e) => setNewCustomerId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={saving || !customers.length}
              className="px-4 py-2 rounded-md bg-gold-500 text-ink-900 font-semibold text-sm hover:bg-gold-400 transition disabled:opacity-60"
            >
              {saving ? "Opening…" : "Open account"}
            </button>
            {!customers.length && <p className="text-text-muted text-xs mt-2">Add a customer first.</p>}
          </form>
        )}

        <div className="border border-paper-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Transact</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-paper-100">
                  <td className="px-4 py-3 font-mono text-[12px] text-text-700">{a.accountNumber}</td>
                  <td className="px-4 py-3 text-text-900">{a.customer?.fullName}</td>
                  <td className="px-4 py-3 text-text-700">GHS {Number(a.balance).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-500">{a.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Amount"
                        className="input !py-1 !w-24 text-[12px]"
                        value={txnAmount[a.id] || ""}
                        onChange={(e) => setTxnAmount((t) => ({ ...t, [a.id]: e.target.value }))}
                      />
                      <button onClick={() => handleTxn(a.id, "deposit")} className="text-[12px] text-green-600 hover:underline">
                        Deposit
                      </button>
                      <button onClick={() => handleTxn(a.id, "withdraw")} className="text-[12px] text-rose-600 hover:underline">
                        Withdraw
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">
                    No savings accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
FILE_EOF
echo 'Wrote: web/app/savings/page.tsx'

echo ""
echo "== Verifying: API typecheck =="
cd api
npm install --silent
npx tsc --noEmit
cd ..

echo "== Verifying: web typecheck + build =="
cd web
npm install --silent
npx tsc --noEmit -p tsconfig.json
npx next build
cd ..

echo ""
echo "New models need a migration:"
echo "  cd api"
echo "  npx prisma migrate dev --name add_loans_savings"
echo ""
echo "Then:"
echo "  git add -A"
echo "  git commit -m \"Loans and Savings: models, routes, frontend\""
echo "  git push"
