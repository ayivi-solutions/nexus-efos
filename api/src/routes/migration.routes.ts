import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

// Data Migration — bulk onboarding of an existing company's data. §35
// Customer Merge and Duplicate Management's principles applied even
// though this isn't literally a merge: configurable matching criteria
// (phone — already the system's own enforced uniqueness key for
// Customer), explicit manual review of anything ambiguous rather than
// silent auto-decisions, and a full audit trail. Every batch is dry-run
// validated (zero writes) before an explicit, separate commit.
export const migrationRouter = Router();
migrationRouter.use(requireAuth);
migrationRouter.use(requirePermission("data.migrate"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only .xlsx files are accepted"));
  },
});

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];
const ID_TYPES = ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID"];
const RISK_RATINGS = ["LOW", "MEDIUM", "HIGH"];

const CUSTOMER_HEADERS = ["Full Name", "Phone", "Email", "Segment", "ID Type", "ID Number", "Risk Rating"];
const CUSTOMER_EXAMPLE = ["Ama Serwaa", "0244111222", "ama@example.com", "INDIVIDUAL", "NATIONAL_ID", "GHA-123456789-0", "LOW"];

migrationRouter.get("/customers/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    CUSTOMER_HEADERS,
    CUSTOMER_EXAMPLE,
    ["", "", "", "", "", "", ""],
    ["Segment must be one of: " + SEGMENTS.join(", ")],
    ["ID Type must be one of: " + ID_TYPES.join(", ") + " (optional)"],
    ["Risk Rating must be one of: " + RISK_RATINGS.join(", ") + " (optional)"],
    ["Phone is the field used to detect if a customer already exists — must be unique per row."],
  ]);
  ws["!cols"] = CUSTOMER_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, "Customers");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=nexus-customer-import-template.xlsx");
  res.send(buffer);
});

interface ParsedCustomerRow {
  rowNumber: number;
  fullName: string;
  phone: string;
  email: string;
  segment: string;
  idType: string;
  idNumber: string;
  riskRating: string;
}

interface RowResult {
  rowNumber: number;
  data: ParsedCustomerRow;
  status: "valid" | "error" | "duplicate";
  errors: string[];
  existingCustomerId?: string;
}

function parseCustomerWorkbook(buffer: Buffer): ParsedCustomerRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const dataRows = rows.slice(1); // skip header row
  return dataRows
    .map((r, i) => ({
      rowNumber: i + 2, // +1 for header, +1 for 1-indexing
      fullName: String(r[0] ?? "").trim(),
      phone: String(r[1] ?? "").trim(),
      email: String(r[2] ?? "").trim(),
      segment: String(r[3] ?? "").trim().toUpperCase(),
      idType: String(r[4] ?? "").trim().toUpperCase(),
      idNumber: String(r[5] ?? "").trim(),
      riskRating: String(r[6] ?? "").trim().toUpperCase(),
    }))
    .filter((r) => r.fullName || r.phone); // skip fully-blank rows
}

async function validateCustomerRows(rows: ParsedCustomerRow[], institutionId: string): Promise<RowResult[]> {
  const seenPhones = new Set<string>();
  const results: RowResult[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    if (!row.fullName) errors.push("Full Name is required");
    if (!row.phone) errors.push("Phone is required");
    if (row.phone && seenPhones.has(row.phone)) errors.push("Duplicate phone number within this file");
    if (row.phone) seenPhones.add(row.phone);
    if (!SEGMENTS.includes(row.segment)) errors.push(`Segment must be one of: ${SEGMENTS.join(", ")}`);
    if (row.idType && !ID_TYPES.includes(row.idType)) errors.push(`ID Type must be one of: ${ID_TYPES.join(", ")}`);
    if (row.riskRating && !RISK_RATINGS.includes(row.riskRating)) errors.push(`Risk Rating must be one of: ${RISK_RATINGS.join(", ")}`);
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Email is not a valid format");

    if (errors.length > 0) {
      results.push({ rowNumber: row.rowNumber, data: row, status: "error", errors });
      continue;
    }

    const existing = await prisma.customer.findFirst({ where: { institutionId, phone: row.phone } });
    if (existing) {
      results.push({ rowNumber: row.rowNumber, data: row, status: "duplicate", errors: [], existingCustomerId: existing.id });
    } else {
      results.push({ rowNumber: row.rowNumber, data: row, status: "valid", errors: [] });
    }
  }

  return results;
}

migrationRouter.post("/customers/dry-run", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let rows: ParsedCustomerRow[];
  try {
    rows = parseCustomerWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file — make sure it's a valid .xlsx exported from the template" });
  }
  if (rows.length === 0) return res.status(400).json({ error: "No data rows found in this file" });

  const results = await validateCustomerRows(rows, req.auth!.institutionId);
  const summary = {
    totalRows: results.length,
    validCount: results.filter((r) => r.status === "valid").length,
    errorCount: results.filter((r) => r.status === "error").length,
    duplicateCount: results.filter((r) => r.status === "duplicate").length,
  };

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.customers_dry_run", resource: "import_batch", metadata: { fileName: req.file.originalname, ...summary } },
  });

  res.json({ summary, results });
});

// Commit re-validates everything from scratch server-side — the dry-run
// report is never trusted as still-accurate; the file people actually
// re-submit here is the sole source of truth for what gets written.
migrationRouter.post("/customers/commit", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let resolutions: Record<string, "skip" | "update"> = {};
  try {
    if (req.body.resolutions) resolutions = JSON.parse(req.body.resolutions);
  } catch {
    return res.status(400).json({ error: "resolutions must be valid JSON, e.g. {\"0244111222\": \"skip\"}" });
  }

  let rows: ParsedCustomerRow[];
  try {
    rows = parseCustomerWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file" });
  }

  const results = await validateCustomerRows(rows, req.auth!.institutionId);
  const blockingErrors = results.filter((r) => r.status === "error");
  if (blockingErrors.length > 0) {
    return res.status(400).json({ error: "This file still has unresolved errors — fix them and re-run a dry-run before committing", results: blockingErrors });
  }

  const toSkip = results.filter((r) => r.status === "duplicate" && resolutions[r.data.phone] !== "update");

  const batch = await prisma.importBatch.create({
    data: {
      institutionId: req.auth!.institutionId,
      entityType: "CUSTOMER",
      method: "STANDARD",
      status: "DRY_RUN",
      fileName: req.file.originalname,
      totalRows: results.length,
      successRows: 0,
      errorRows: 0,
      createdById: req.auth!.userId,
    },
  });

  let successRows = 0;
  const rowErrors: { rowNumber: number; error: string }[] = [];

  for (const r of results) {
    if (r.status === "duplicate" && resolutions[r.data.phone] !== "update") continue; // skip
    try {
      if (r.status === "duplicate" && resolutions[r.data.phone] === "update") {
        await prisma.customer.update({
          where: { id: r.existingCustomerId! },
          data: {
            fullName: r.data.fullName,
            email: r.data.email || null,
            segment: r.data.segment as any,
            idType: (r.data.idType || null) as any,
            idNumber: r.data.idNumber || null,
            riskRating: (r.data.riskRating || null) as any,
            importBatchId: batch.id,
          },
        });
      } else {
        await prisma.customer.create({
          data: {
            institutionId: req.auth!.institutionId,
            fullName: r.data.fullName,
            phone: r.data.phone,
            email: r.data.email || null,
            segment: r.data.segment as any,
            idType: (r.data.idType || null) as any,
            idNumber: r.data.idNumber || null,
            riskRating: (r.data.riskRating || null) as any,
            status: "ACTIVE", // migrated customers are presumed already-known to the business
            kycStatus: "VERIFIED", // presumed already KYC'd prior to migration
            importBatchId: batch.id,
          },
        });
      }
      successRows++;
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, error: err.message || "Unknown error" });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: rowErrors.length === 0 ? "COMMITTED" : "FAILED",
      successRows,
      errorRows: rowErrors.length,
      committedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.customers_commit", resource: "import_batch", resourceId: batch.id, metadata: { successRows, errorRows: rowErrors.length, skipped: toSkip.length } },
  });

  res.status(201).json({ batch, successRows, errorRows: rowErrors.length, rowErrors, skipped: toSkip.length });
});

migrationRouter.get("/batches", requirePermission("data.migrate"), async (req: AuthedRequest, res) => {
  const batches = await prisma.importBatch.findMany({
    where: { institutionId: req.auth!.institutionId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ batches });
});
