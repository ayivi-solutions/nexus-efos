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
//
// Rebuilt (v2) to actually reflect the real Customer architecture this
// app has — not a thin 7-field demo. The template is a proper 5-sheet
// workbook: a dedicated Instructions sheet separate from the sheets a
// person actually enters data into (the original version cluttered
// validation notes as extra rows in the same sheet as the data, which is
// genuinely bad practice, not just a style nitpick), a Customers sheet
// covering the full field set that's appropriate for a company to supply
// at migration time, and three linked sheets (Next of Kin, Beneficiaries,
// Beneficial Owners) for the one-to-many sub-entities that a flat single
// sheet structurally cannot represent — each row references its parent
// customer by phone number, cross-validated against the Customers sheet.
export const migrationRouter = Router();
migrationRouter.use(requireAuth);
migrationRouter.use(requirePermission("data.migrate"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only .xlsx files are accepted"));
  },
});

const SEGMENTS = ["INDIVIDUAL", "BUSINESS", "FARMER_GROUP", "WOMENS_GROUP", "YOUTH", "CORPORATE"];
const ID_TYPES = ["NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID"];
const RISK_RATINGS = ["LOW", "MEDIUM", "HIGH"];
const PREFERRED_CHANNELS = ["SMS", "EMAIL", "WHATSAPP", "CALL"];
const PEP_STATUSES = ["NOT_PEP", "DOMESTIC_PEP", "FOREIGN_PEP", "PEP_ASSOCIATE"];

// ---------------------------------------------------------------------
// Template generation — 5 sheets
// ---------------------------------------------------------------------

function buildCustomerTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Nexus EFOS — Customer Data Migration: Instructions"],
    [""],
    ["This workbook has 4 data sheets. Fill in the ones that apply — Next of Kin, Beneficiaries, and Beneficial Owners are optional and can be left empty."],
    [""],
    ["1. Customers — one row per customer. Required for every row."],
    ["2. Next of Kin — optional, one row per next-of-kin record. Link each row to its customer using the exact Phone number from the Customers sheet."],
    ["3. Beneficiaries — optional, one row per beneficiary. Same linking rule. The Allocation % across all beneficiaries for one customer must not exceed 100."],
    ["4. Beneficial Owners — optional, one row per owner (Business/Corporate customers only). Same linking rule."],
    [""],
    ["How matching works:"],
    ["Phone number is what the system uses to detect whether a customer already exists. It must be unique within the Customers sheet."],
    ["If a row's phone matches an existing customer, you will be asked — per row, at review time — whether to skip it or update the existing record. Nothing is decided automatically."],
    [""],
    ["IMPORTANT — before typing any phone numbers:"],
    ["Excel treats a cell that looks like a number as a number by default, which silently deletes the leading 0 from a Ghana phone number as you type it (0244111222 becomes 244111222). Before entering data, select the Phone and Customer Phone columns, right-click, choose Format Cells, and set them to Text. Every phone number must start with 0 and be exactly 10 digits — if it isn't, the system will reject it with a message telling you the leading zero looks like it was stripped."],
    [""],
    ["Field reference — Customers sheet:"],
    ["Full Name — required"],
    ["Phone — required, must be unique in this file"],
    ["Email — optional"],
    ["Segment — required. One of: " + SEGMENTS.join(", ")],
    ["ID Type — optional. One of: " + ID_TYPES.join(", ")],
    ["ID Number — optional"],
    ["Risk Rating — optional. One of: " + RISK_RATINGS.join(", ")],
    ["Preferred Channel — optional. One of: " + PREFERRED_CHANNELS.join(", ")],
    ["Preferred Language — optional, free text (e.g. Ewe, Twi, English)"],
    ["PEP Status — optional, defaults to NOT_PEP. One of: " + PEP_STATUSES.join(", ")],
    ["CDD Notes — optional, free text"],
    ["SMS / Email / WhatsApp / Marketing / Transaction Alerts / Statement Delivery Enabled — optional, Y or N, all default to their normal on/off setting if left blank"],
    [""],
    ["What happens automatically for every migrated customer:"],
    ["Status is set to ACTIVE and KYC Status to VERIFIED — migration assumes these customers are already known to your business. Lifecycle Stage, Watchlist screening, and CDD Level are system-managed and cannot be set from this file."],
  ]);
  instructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  const customerHeaders = ["Full Name", "Phone", "Email", "Segment", "ID Type", "ID Number", "Risk Rating", "Preferred Channel", "Preferred Language", "PEP Status", "CDD Notes", "SMS Enabled", "Email Enabled", "WhatsApp Enabled", "Marketing Enabled", "Transaction Alerts Enabled", "Statement Delivery Enabled"];
  const customerExample = ["Ama Serwaa", "0244111222", "ama@example.com", "INDIVIDUAL", "NATIONAL_ID", "GHA-123456789-0", "LOW", "SMS", "English", "NOT_PEP", "", "Y", "Y", "Y", "N", "Y", "Y"];
  const customersSheet = XLSX.utils.aoa_to_sheet([customerHeaders, customerExample]);
  customersSheet["!cols"] = customerHeaders.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, customersSheet, "Customers");

  const nokHeaders = ["Customer Phone", "Full Name", "Relationship", "Phone", "Email", "Address"];
  const nokExample = ["0244111222", "Kofi Serwaa", "Spouse", "0244111223", "", "12 Ring Road, Accra"];
  const nokSheet = XLSX.utils.aoa_to_sheet([nokHeaders, nokExample]);
  nokSheet["!cols"] = nokHeaders.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, nokSheet, "Next of Kin");

  const beneHeaders = ["Customer Phone", "Full Name", "Relationship", "Allocation %", "Phone"];
  const beneExample = ["0244111222", "Kofi Serwaa", "Spouse", "100", "0244111223"];
  const beneSheet = XLSX.utils.aoa_to_sheet([beneHeaders, beneExample]);
  beneSheet["!cols"] = beneHeaders.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, beneSheet, "Beneficiaries");

  const boHeaders = ["Customer Phone", "Full Name", "Ownership %", "ID Type", "ID Number"];
  const boExample = ["0244111222", "Ama Serwaa", "60", "NATIONAL_ID", "GHA-123456789-0"];
  const boSheet = XLSX.utils.aoa_to_sheet([boHeaders, boExample]);
  boSheet["!cols"] = boHeaders.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, boSheet, "Beneficial Owners");

  return wb;
}

migrationRouter.get("/customers/template", (_req, res) => {
  const wb = buildCustomerTemplate();
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=nexus-customer-import-template.xlsx");
  res.send(buffer);
});

// ---------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------

interface CustomerRow {
  rowNumber: number;
  fullName: string; phone: string; email: string; segment: string; idType: string; idNumber: string;
  riskRating: string; preferredChannel: string; preferredLanguage: string; pepStatus: string; cddNotes: string;
  smsEnabled: string; emailEnabled: string; whatsappEnabled: string; marketingEnabled: string;
  transactionAlertsEnabled: string; statementDeliveryEnabled: string;
}
interface NokRow { rowNumber: number; customerPhone: string; fullName: string; relationship: string; phone: string; email: string; address: string; }
interface BeneRow { rowNumber: number; customerPhone: string; fullName: string; relationship: string; allocationPct: string; phone: string; }
interface BoRow { rowNumber: number; customerPhone: string; fullName: string; ownershipPct: string; idType: string; idNumber: string; }

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  return rows.slice(1); // skip header
}

function str(v: any): string {
  return String(v ?? "").trim();
}

function parseWorkbook(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const customers: CustomerRow[] = sheetToRows(wb, "Customers")
    .map((r, i) => ({
      rowNumber: i + 2,
      fullName: str(r[0]), phone: str(r[1]), email: str(r[2]), segment: str(r[3]).toUpperCase(),
      idType: str(r[4]).toUpperCase(), idNumber: str(r[5]), riskRating: str(r[6]).toUpperCase(),
      preferredChannel: str(r[7]).toUpperCase(), preferredLanguage: str(r[8]), pepStatus: str(r[9]).toUpperCase() || "NOT_PEP",
      cddNotes: str(r[10]), smsEnabled: str(r[11]).toUpperCase(), emailEnabled: str(r[12]).toUpperCase(),
      whatsappEnabled: str(r[13]).toUpperCase(), marketingEnabled: str(r[14]).toUpperCase(),
      transactionAlertsEnabled: str(r[15]).toUpperCase(), statementDeliveryEnabled: str(r[16]).toUpperCase(),
    }))
    .filter((r) => r.fullName || r.phone);

  const nextOfKin: NokRow[] = sheetToRows(wb, "Next of Kin")
    .map((r, i) => ({ rowNumber: i + 2, customerPhone: str(r[0]), fullName: str(r[1]), relationship: str(r[2]), phone: str(r[3]), email: str(r[4]), address: str(r[5]) }))
    .filter((r) => r.customerPhone || r.fullName);

  const beneficiaries: BeneRow[] = sheetToRows(wb, "Beneficiaries")
    .map((r, i) => ({ rowNumber: i + 2, customerPhone: str(r[0]), fullName: str(r[1]), relationship: str(r[2]), allocationPct: str(r[3]), phone: str(r[4]) }))
    .filter((r) => r.customerPhone || r.fullName);

  const beneficialOwners: BoRow[] = sheetToRows(wb, "Beneficial Owners")
    .map((r, i) => ({ rowNumber: i + 2, customerPhone: str(r[0]), fullName: str(r[1]), ownershipPct: str(r[2]), idType: str(r[3]).toUpperCase(), idNumber: str(r[4]) }))
    .filter((r) => r.customerPhone || r.fullName);

  return { customers, nextOfKin, beneficiaries, beneficialOwners };
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

const YN = (v: string) => v === "" || v === "Y" || v === "N";

// Ghana phone numbers are always 10 digits starting with 0. Excel silently
// strips a leading zero from any cell it auto-detects as a number, which
// is the single most likely way a phone number arrives malformed from a
// person typing into an unformatted cell — caught here with a specific,
// actionable message rather than a generic "invalid format" error, since
// the fix (re-enter as Text) is different from a genuinely wrong number.
function phoneError(phone: string): string | null {
  // A number Excel actually stripped a leading zero from is 9 digits and
  // does NOT itself start with 0 (the removed digit was the only 0 at the
  // front) — the earlier version of this check matched ANY 9-digit string,
  // which wrongly blamed Excel for a genuinely-too-short number that
  // happened to already start with 0 (e.g. "024411122"). Fixed to require
  // the first digit be 1-9, the actual signature of this specific failure.
  if (/^[1-9]\d{8}$/.test(phone)) {
    return `"${phone}" is 9 digits and doesn't start with 0 — this looks like Excel stripped the leading zero when it treated the cell as a number. Re-enter this cell as Text (right-click the column → Format Cells → Text), starting with 0.`;
  }
  if (!/^0\d{9}$/.test(phone)) {
    return "Phone must be exactly 10 digits starting with 0 (e.g. 0244111222)";
  }
  return null;
}

async function validateAll(parsed: ReturnType<typeof parseWorkbook>, institutionId: string) {
  const seenPhones = new Set<string>();
  const customerResults = [];

  for (const row of parsed.customers) {
    const errors: string[] = [];
    if (!row.fullName) errors.push("Full Name is required");
    if (!row.phone) errors.push("Phone is required");
    else { const pe = phoneError(row.phone); if (pe) errors.push(pe); }
    if (row.phone && seenPhones.has(row.phone)) errors.push("Duplicate phone number within the Customers sheet");
    if (row.phone) seenPhones.add(row.phone);
    if (!SEGMENTS.includes(row.segment)) errors.push(`Segment must be one of: ${SEGMENTS.join(", ")}`);
    if (row.idType && !ID_TYPES.includes(row.idType)) errors.push(`ID Type must be one of: ${ID_TYPES.join(", ")}`);
    if (row.riskRating && !RISK_RATINGS.includes(row.riskRating)) errors.push(`Risk Rating must be one of: ${RISK_RATINGS.join(", ")}`);
    if (row.preferredChannel && !PREFERRED_CHANNELS.includes(row.preferredChannel)) errors.push(`Preferred Channel must be one of: ${PREFERRED_CHANNELS.join(", ")}`);
    if (!PEP_STATUSES.includes(row.pepStatus)) errors.push(`PEP Status must be one of: ${PEP_STATUSES.join(", ")}`);
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Email is not a valid format");
    for (const [label, val] of [["SMS Enabled", row.smsEnabled], ["Email Enabled", row.emailEnabled], ["WhatsApp Enabled", row.whatsappEnabled], ["Marketing Enabled", row.marketingEnabled], ["Transaction Alerts Enabled", row.transactionAlertsEnabled], ["Statement Delivery Enabled", row.statementDeliveryEnabled]]) {
      if (!YN(val as string)) errors.push(`${label} must be Y, N, or left blank`);
    }

    if (errors.length > 0) {
      customerResults.push({ rowNumber: row.rowNumber, sheet: "Customers", data: row, status: "error" as const, errors });
      continue;
    }
    const existing = await prisma.customer.findFirst({ where: { institutionId, phone: row.phone } });
    if (existing) {
      customerResults.push({ rowNumber: row.rowNumber, sheet: "Customers", data: row, status: "duplicate" as const, errors: [], existingCustomerId: existing.id });
    } else {
      customerResults.push({ rowNumber: row.rowNumber, sheet: "Customers", data: row, status: "valid" as const, errors: [] });
    }
  }

  const knownPhones = new Set(parsed.customers.map((c) => c.phone));

  const nokResults = parsed.nextOfKin.map((row) => {
    const errors: string[] = [];
    if (!row.customerPhone) errors.push("Customer Phone is required");
    else if (!knownPhones.has(row.customerPhone)) { const pe = phoneError(row.customerPhone); errors.push(pe ? `Customer Phone: ${pe}` : `Customer Phone "${row.customerPhone}" does not match any row in the Customers sheet`); }
    if (!row.fullName) errors.push("Full Name is required");
    if (!row.relationship) errors.push("Relationship is required");
    if (!row.phone) errors.push("Phone is required");
    else { const pe = phoneError(row.phone); if (pe) errors.push(pe); }
    return { rowNumber: row.rowNumber, sheet: "Next of Kin", data: row, status: (errors.length ? "error" : "valid") as "error" | "valid", errors };
  });

  const beneByCustomer: Record<string, number> = {};
  for (const row of parsed.beneficiaries) {
    const pct = Number(row.allocationPct);
    if (!isNaN(pct) && row.customerPhone) beneByCustomer[row.customerPhone] = (beneByCustomer[row.customerPhone] || 0) + pct;
  }
  const beneResults = parsed.beneficiaries.map((row) => {
    const errors: string[] = [];
    if (!row.customerPhone) errors.push("Customer Phone is required");
    else if (!knownPhones.has(row.customerPhone)) { const pe = phoneError(row.customerPhone); errors.push(pe ? `Customer Phone: ${pe}` : `Customer Phone "${row.customerPhone}" does not match any row in the Customers sheet`); }
    if (!row.fullName) errors.push("Full Name is required");
    if (!row.relationship) errors.push("Relationship is required");
    const pct = Number(row.allocationPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) errors.push("Allocation % must be a number between 0 and 100");
    if (row.customerPhone && beneByCustomer[row.customerPhone] > 100) errors.push(`Total allocation for this customer across all beneficiary rows exceeds 100% (currently ${beneByCustomer[row.customerPhone]}%)`);
    return { rowNumber: row.rowNumber, sheet: "Beneficiaries", data: row, status: (errors.length ? "error" : "valid") as "error" | "valid", errors };
  });

  const boResults = parsed.beneficialOwners.map((row) => {
    const errors: string[] = [];
    if (!row.customerPhone) errors.push("Customer Phone is required");
    else if (!knownPhones.has(row.customerPhone)) { const pe = phoneError(row.customerPhone); errors.push(pe ? `Customer Phone: ${pe}` : `Customer Phone "${row.customerPhone}" does not match any row in the Customers sheet`); }
    if (!row.fullName) errors.push("Full Name is required");
    const pct = Number(row.ownershipPct);
    if (isNaN(pct) || pct <= 0 || pct > 100) errors.push("Ownership % must be a number between 0 and 100");
    if (row.idType && !ID_TYPES.includes(row.idType)) errors.push(`ID Type must be one of: ${ID_TYPES.join(", ")}`);
    return { rowNumber: row.rowNumber, sheet: "Beneficial Owners", data: row, status: (errors.length ? "error" : "valid") as "error" | "valid", errors };
  });

  return { customerResults, nokResults, beneResults, boResults };
}

// ---------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------

migrationRouter.post("/customers/dry-run", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let parsed: ReturnType<typeof parseWorkbook>;
  try {
    parsed = parseWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file — make sure it's a valid .xlsx exported from the template" });
  }
  if (parsed.customers.length === 0) return res.status(400).json({ error: "No data rows found in the Customers sheet" });

  const { customerResults, nokResults, beneResults, boResults } = await validateAll(parsed, req.auth!.institutionId);

  const summary = {
    customers: { total: customerResults.length, valid: customerResults.filter((r) => r.status === "valid").length, duplicate: customerResults.filter((r) => r.status === "duplicate").length, error: customerResults.filter((r) => r.status === "error").length },
    nextOfKin: { total: nokResults.length, valid: nokResults.filter((r) => r.status === "valid").length, error: nokResults.filter((r) => r.status === "error").length },
    beneficiaries: { total: beneResults.length, valid: beneResults.filter((r) => r.status === "valid").length, error: beneResults.filter((r) => r.status === "error").length },
    beneficialOwners: { total: boResults.length, valid: boResults.filter((r) => r.status === "valid").length, error: boResults.filter((r) => r.status === "error").length },
  };

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.customers_dry_run", resource: "import_batch", metadata: { fileName: req.file.originalname, summary } },
  });

  res.json({ summary, customerResults, nokResults, beneResults, boResults });
});

// ---------------------------------------------------------------------
// Commit — re-validates everything from scratch server-side
// ---------------------------------------------------------------------

migrationRouter.post("/customers/commit", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let resolutions: Record<string, "skip" | "update"> = {};
  try {
    if (req.body.resolutions) resolutions = JSON.parse(req.body.resolutions);
  } catch {
    return res.status(400).json({ error: 'resolutions must be valid JSON, e.g. {"0244111222": "skip"}' });
  }

  let parsed: ReturnType<typeof parseWorkbook>;
  try {
    parsed = parseWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file" });
  }

  const { customerResults, nokResults, beneResults, boResults } = await validateAll(parsed, req.auth!.institutionId);
  const allErrors = [...customerResults, ...nokResults, ...beneResults, ...boResults].filter((r) => r.status === "error");
  if (allErrors.length > 0) {
    return res.status(400).json({ error: "This file still has unresolved errors — fix them and re-run a dry-run before committing", errors: allErrors });
  }

  const batch = await prisma.importBatch.create({
    data: {
      institutionId: req.auth!.institutionId, entityType: "CUSTOMER", method: "STANDARD", status: "DRY_RUN",
      fileName: req.file.originalname, totalRows: customerResults.length, successRows: 0, errorRows: 0, createdById: req.auth!.userId,
    },
  });

  let successRows = 0;
  let skipped = 0;
  const rowErrors: { rowNumber: number; sheet: string; error: string }[] = [];
  const customerIdByPhone: Record<string, string> = {};

  for (const r of customerResults) {
    if (r.status === "duplicate" && resolutions[r.data.phone] !== "update") { skipped++; continue; }
    try {
      const commonData = {
        fullName: r.data.fullName, email: r.data.email || null, segment: r.data.segment as any,
        idType: r.data.idType || null, idNumber: r.data.idNumber || null, riskRating: (r.data.riskRating || null) as any,
        preferredChannel: r.data.preferredChannel || null, preferredLanguage: r.data.preferredLanguage || null,
        pepStatus: r.data.pepStatus as any, cddNotes: r.data.cddNotes || null,
        ...(r.data.smsEnabled && { smsEnabled: r.data.smsEnabled === "Y" }),
        ...(r.data.emailEnabled && { emailEnabled: r.data.emailEnabled === "Y" }),
        ...(r.data.whatsappEnabled && { whatsappEnabled: r.data.whatsappEnabled === "Y" }),
        ...(r.data.marketingEnabled && { marketingEnabled: r.data.marketingEnabled === "Y" }),
        ...(r.data.transactionAlertsEnabled && { transactionAlertsEnabled: r.data.transactionAlertsEnabled === "Y" }),
        ...(r.data.statementDeliveryEnabled && { statementDeliveryEnabled: r.data.statementDeliveryEnabled === "Y" }),
      };

      let customerId: string;
      if (r.status === "duplicate") {
        const updated = await prisma.customer.update({ where: { id: r.existingCustomerId! }, data: { ...commonData, importBatchId: batch.id } });
        customerId = updated.id;
      } else {
        const created = await prisma.customer.create({
          data: { institutionId: req.auth!.institutionId, phone: r.data.phone, status: "ACTIVE", kycStatus: "VERIFIED", importBatchId: batch.id, ...commonData },
        });
        customerId = created.id;
      }
      customerIdByPhone[r.data.phone] = customerId;
      successRows++;
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, sheet: "Customers", error: err.message || "Unknown error" });
    }
  }

  for (const r of nokResults) {
    const customerId = customerIdByPhone[r.data.customerPhone];
    if (!customerId) continue; // parent customer was skipped
    try {
      await prisma.nextOfKin.create({ data: { customerId, fullName: r.data.fullName, relationship: r.data.relationship, phone: r.data.phone, email: r.data.email || null, address: r.data.address || null } });
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, sheet: "Next of Kin", error: err.message || "Unknown error" });
    }
  }

  for (const r of beneResults) {
    const customerId = customerIdByPhone[r.data.customerPhone];
    if (!customerId) continue;
    try {
      await prisma.beneficiary.create({ data: { customerId, fullName: r.data.fullName, relationship: r.data.relationship, allocationPct: Number(r.data.allocationPct), phone: r.data.phone || null } });
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, sheet: "Beneficiaries", error: err.message || "Unknown error" });
    }
  }

  for (const r of boResults) {
    const customerId = customerIdByPhone[r.data.customerPhone];
    if (!customerId) continue;
    try {
      await prisma.beneficialOwner.create({ data: { customerId, fullName: r.data.fullName, ownershipPct: Number(r.data.ownershipPct), idType: r.data.idType || null, idNumber: r.data.idNumber || null } });
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, sheet: "Beneficial Owners", error: err.message || "Unknown error" });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: rowErrors.length === 0 ? "COMMITTED" : "FAILED", successRows, errorRows: rowErrors.length, committedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.customers_commit", resource: "import_batch", resourceId: batch.id, metadata: { successRows, errorRows: rowErrors.length, skipped } },
  });

  res.status(201).json({ batch, successRows, errorRows: rowErrors.length, rowErrors, skipped });
});

migrationRouter.get("/batches", async (req: AuthedRequest, res) => {
  const batches = await prisma.importBatch.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ batches });
});
