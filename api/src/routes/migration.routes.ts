import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { generateAccountNumber } from "../lib/accountNumber";
import { round2, generateSchedule, generateRemainingSchedule, allocateRepayment } from "../lib/loanSchedule";

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

// =======================================================================
// SAVINGS ACCOUNT MIGRATION
// =======================================================================

const SAVINGS_ACCOUNT_STATUSES = ["ACTIVE", "DORMANT", "CLOSED"];

function buildSavingsTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Nexus EFOS — Savings Account Migration: Instructions"],
    [""],
    ["One row per savings account. The customer must already exist in Nexus — run the Customer migration first if you haven't yet."],
    [""],
    ["Field reference:"],
    ["Customer Phone — required. Must match an existing customer's phone number exactly."],
    ["Product Code — required. Must match an existing, active Savings product's code (see the Products page)."],
    ["Account Number — optional. Leave blank to auto-generate; fill in only if you need to preserve an existing account number from your previous system."],
    ["Opening Balance — required. The account's current balance in GHS, as of today. This is recorded as a real transaction, not just a number — so the account's history stays consistent from day one, same as every other account."],
    ["Status — optional, defaults to ACTIVE. One of: " + SAVINGS_ACCOUNT_STATUSES.join(", ")],
    [""],
    ["IMPORTANT — before typing any phone numbers:"],
    ["Excel treats a cell that looks like a number as a number by default, which silently deletes the leading 0 from a Ghana phone number as you type it (0244111222 becomes 244111222). Before entering data, select the Customer Phone column, right-click, choose Format Cells, and set it to Text. If the system detects this happened, it will tell you exactly which row and how to fix it."],
  ]);
  instructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  const headers = ["Customer Phone", "Product Code", "Account Number", "Opening Balance", "Status"];
  const example = ["0244111222", "SAV-01", "", "1000", "ACTIVE"];
  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, sheet, "Savings Accounts");

  return wb;
}

migrationRouter.get("/savings/template", (_req, res) => {
  const wb = buildSavingsTemplate();
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=nexus-savings-import-template.xlsx");
  res.send(buffer);
});

interface SavingsRow {
  rowNumber: number;
  customerPhone: string;
  productCode: string;
  accountNumber: string;
  openingBalance: string;
  status: string;
}

function parseSavingsWorkbook(buffer: Buffer): SavingsRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return sheetToRows(wb, "Savings Accounts")
    .map((r, i) => ({
      rowNumber: i + 2,
      customerPhone: str(r[0]),
      productCode: str(r[1]),
      accountNumber: str(r[2]),
      openingBalance: str(r[3]),
      status: str(r[4]).toUpperCase() || "ACTIVE",
    }))
    .filter((r) => r.customerPhone || r.productCode);
}

async function validateSavingsRows(rows: SavingsRow[], institutionId: string) {
  const results = [];
  const seenAccountNumbers = new Set<string>();

  for (const row of rows) {
    const errors: string[] = [];
    if (!row.customerPhone) errors.push("Customer Phone is required");
    else {
      const pe = phoneError(row.customerPhone);
      if (pe) errors.push(`Customer Phone: ${pe}`);
    }
    if (!row.productCode) errors.push("Product Code is required");
    if (!SAVINGS_ACCOUNT_STATUSES.includes(row.status)) errors.push(`Status must be one of: ${SAVINGS_ACCOUNT_STATUSES.join(", ")}`);
    const balance = Number(row.openingBalance);
    if (row.openingBalance === "" || isNaN(balance) || balance < 0) errors.push("Opening Balance must be a number ≥ 0");
    if (row.accountNumber) {
      if (seenAccountNumbers.has(row.accountNumber)) errors.push("Duplicate Account Number within this file");
      seenAccountNumbers.add(row.accountNumber);
    }

    let customer = null;
    let productVersion = null;
    if (row.customerPhone && !phoneError(row.customerPhone)) {
      customer = await prisma.customer.findFirst({ where: { institutionId, phone: row.customerPhone } });
      if (!customer) errors.push(`No customer found with phone "${row.customerPhone}" — import customers first`);
    }
    if (row.productCode) {
      const product = await prisma.product.findFirst({ where: { institutionId, code: row.productCode, type: "SAVINGS" }, include: { currentVersion: true } });
      if (!product) errors.push(`No Savings product found with code "${row.productCode}"`);
      else if (product.status !== "ACTIVE") errors.push(`Product "${row.productCode}" is not currently active`);
      else productVersion = product.currentVersion;
    }
    if (row.accountNumber) {
      const existingAcct = await prisma.savingsAccount.findFirst({ where: { accountNumber: row.accountNumber } });
      if (existingAcct) errors.push(`Account Number "${row.accountNumber}" is already in use`);
    }

    results.push({
      rowNumber: row.rowNumber, sheet: "Savings Accounts", data: row,
      status: (errors.length ? "error" : "valid") as "error" | "valid", errors,
      customerId: customer?.id, productVersionId: productVersion?.id,
    });
  }

  return results;
}

migrationRouter.post("/savings/dry-run", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let rows: SavingsRow[];
  try {
    rows = parseSavingsWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file — make sure it's a valid .xlsx exported from the template" });
  }
  if (rows.length === 0) return res.status(400).json({ error: "No data rows found in the Savings Accounts sheet" });

  const results = await validateSavingsRows(rows, req.auth!.institutionId);
  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === "valid").length,
    error: results.filter((r) => r.status === "error").length,
  };

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.savings_dry_run", resource: "import_batch", metadata: { fileName: req.file.originalname, summary } },
  });

  res.json({ summary, results });
});

migrationRouter.post("/savings/commit", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let rows: SavingsRow[];
  try {
    rows = parseSavingsWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file" });
  }

  const results = await validateSavingsRows(rows, req.auth!.institutionId);
  const blockingErrors = results.filter((r) => r.status === "error");
  if (blockingErrors.length > 0) {
    return res.status(400).json({ error: "This file still has unresolved errors — fix them and re-run a dry-run before committing", errors: blockingErrors });
  }

  const batch = await prisma.importBatch.create({
    data: {
      institutionId: req.auth!.institutionId, entityType: "SAVINGS_ACCOUNT", method: "STANDARD", status: "DRY_RUN",
      fileName: req.file.originalname, totalRows: results.length, successRows: 0, errorRows: 0, createdById: req.auth!.userId,
    },
  });

  let successRows = 0;
  const rowErrors: { rowNumber: number; sheet: string; error: string }[] = [];

  for (const r of results) {
    try {
      const openingBalance = round2(Number(r.data.openingBalance));
      const accountNumber = r.data.accountNumber || generateAccountNumber();

      await prisma.$transaction(async (tx) => {
        const account = await tx.savingsAccount.create({
          data: {
            institutionId: req.auth!.institutionId, customerId: r.customerId!, productVersionId: r.productVersionId!,
            accountNumber, balance: openingBalance, ledgerBalance: openingBalance, status: r.data.status as any, importBatchId: batch.id,
          },
        });
        if (openingBalance > 0) {
          await tx.savingsTransaction.create({
            data: { accountId: account.id, type: "MIGRATION_OPENING_BALANCE", amount: openingBalance, balanceAfter: openingBalance, recordedById: req.auth!.userId },
          });
        }
      });
      successRows++;
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, sheet: "Savings Accounts", error: err.message || "Unknown error" });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: rowErrors.length === 0 ? "COMMITTED" : "FAILED", successRows, errorRows: rowErrors.length, committedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.savings_commit", resource: "import_batch", resourceId: batch.id, metadata: { successRows, errorRows: rowErrors.length } },
  });

  res.status(201).json({ batch, successRows, errorRows: rowErrors.length, rowErrors });
});

// =======================================================================
// LOAN MIGRATION — two methods, one page, two templates
// =======================================================================

const INTEREST_METHODS = ["FLAT", "REDUCING_BALANCE"];

function buildLoanOpeningBalanceTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Nexus EFOS — Loan Migration (Opening Balance method): Instructions"],
    [""],
    ["Use this method when you want a clean starting point: the loan is recorded as already disbursed, with whatever balance remains today, and a fresh repayment schedule for only what's left. Nexus will not have a record of payments made before today — if you need that full history, use the separate Full History template instead."],
    [""],
    ["Field reference:"],
    ["Customer Phone — required. Must match an existing customer's phone number exactly."],
    ["Product Code — required. Must match an existing, active Loan product's code."],
    ["Original Principal — required. The full amount originally disbursed, in GHS."],
    ["Interest Rate — required. Annual percentage rate."],
    ["Interest Method — required. One of: " + INTEREST_METHODS.join(", ")],
    ["Term Months — required. The original loan term, for record-keeping."],
    ["Disbursed Date — required. When the loan was originally disbursed (YYYY-MM-DD)."],
    ["Outstanding Principal — required. How much principal is still owed today, in GHS."],
    ["Outstanding Interest — optional, defaults to 0. How much interest is still owed today, in GHS."],
    ["Remaining Installments — required. How many payments are left."],
    ["Next Due Date — required. When the next payment is due (YYYY-MM-DD)."],
    [""],
    ["What happens: the outstanding principal and interest are split evenly across the remaining installments, starting from the next due date. This is an honest even split of what you tell us is left — not a reconstruction of the original schedule, since that history isn't being supplied in this method."],
    [""],
    ["IMPORTANT — format the Customer Phone column as Text before typing (see the Customer migration template for why)."],
  ]);
  instructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  const headers = ["Customer Phone", "Product Code", "Original Principal", "Interest Rate", "Interest Method", "Term Months", "Disbursed Date", "Outstanding Principal", "Outstanding Interest", "Remaining Installments", "Next Due Date"];
  const example = ["0244111222", "LN-01", "5000", "18", "FLAT", "6", "2026-01-15", "3200", "150", "4", "2026-09-01"];
  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, sheet, "Loans");

  return wb;
}

function buildLoanFullHistoryTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Nexus EFOS — Loan Migration (Full History method): Instructions"],
    [""],
    ["Use this method when you have a complete repayment history and want Nexus to hold the real, full record from original disbursement onward — the full original amortization schedule is generated and every historical payment is replayed against it in date order, the same allocation rule (oldest installment first, interest before principal) real repayments have always used."],
    [""],
    ["This workbook has 2 sheets:"],
    ["1. Loan Headers — one row per loan. Give each loan its own External Loan Reference — any short code you choose, used only to link its repayments below."],
    ["2. Repayment History — one row per historical payment. Link each row to its loan using the exact External Loan Reference from the Loan Headers sheet."],
    [""],
    ["Field reference — Loan Headers:"],
    ["External Loan Reference — required, must be unique in this file."],
    ["Customer Phone — required. Must match an existing customer's phone number exactly."],
    ["Product Code — required. Must match an existing, active Loan product's code."],
    ["Principal — required. The amount disbursed, in GHS."],
    ["Interest Rate — required. Annual percentage rate."],
    ["Interest Method — required. One of: " + INTEREST_METHODS.join(", ")],
    ["Term Months — required."],
    ["Disbursed Date — required (YYYY-MM-DD)."],
    [""],
    ["Field reference — Repayment History:"],
    ["External Loan Reference — required, must match a row in Loan Headers."],
    ["Payment Date — required (YYYY-MM-DD)."],
    ["Amount — required, in GHS."],
    [""],
    ["IMPORTANT — format the Customer Phone column as Text before typing (see the Customer migration template for why)."],
  ]);
  instructions["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  const headerCols = ["External Loan Reference", "Customer Phone", "Product Code", "Principal", "Interest Rate", "Interest Method", "Term Months", "Disbursed Date"];
  const headerExample = ["LOAN-001", "0244111222", "LN-01", "5000", "18", "FLAT", "6", "2026-01-15"];
  const headerSheet = XLSX.utils.aoa_to_sheet([headerCols, headerExample]);
  headerSheet["!cols"] = headerCols.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, headerSheet, "Loan Headers");

  const repayCols = ["External Loan Reference", "Payment Date", "Amount"];
  const repayExample = ["LOAN-001", "2026-02-15", "908.33"];
  const repaySheet = XLSX.utils.aoa_to_sheet([repayCols, repayExample]);
  repaySheet["!cols"] = repayCols.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, repaySheet, "Repayment History");

  return wb;
}

migrationRouter.get("/loans/template/opening-balance", (_req, res) => {
  const wb = buildLoanOpeningBalanceTemplate();
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=nexus-loan-opening-balance-template.xlsx");
  res.send(buffer);
});

migrationRouter.get("/loans/template/full-history", (_req, res) => {
  const wb = buildLoanFullHistoryTemplate();
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=nexus-loan-full-history-template.xlsx");
  res.send(buffer);
});

// -----------------------------------------------------------------------
// Opening Balance — parsing, validation, commit
// -----------------------------------------------------------------------

interface LoanOBRow {
  rowNumber: number;
  customerPhone: string; productCode: string; originalPrincipal: string; interestRate: string;
  interestMethod: string; termMonths: string; disbursedDate: string; outstandingPrincipal: string;
  outstandingInterest: string; remainingInstallments: string; nextDueDate: string;
}

function parseLoanOBWorkbook(buffer: Buffer): LoanOBRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return sheetToRows(wb, "Loans")
    .map((r, i) => ({
      rowNumber: i + 2, customerPhone: str(r[0]), productCode: str(r[1]), originalPrincipal: str(r[2]),
      interestRate: str(r[3]), interestMethod: str(r[4]).toUpperCase(), termMonths: str(r[5]), disbursedDate: str(r[6]),
      outstandingPrincipal: str(r[7]), outstandingInterest: str(r[8]) || "0", remainingInstallments: str(r[9]), nextDueDate: str(r[10]),
    }))
    .filter((r) => r.customerPhone || r.productCode);
}

function parseDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function validateLoanOBRows(rows: LoanOBRow[], institutionId: string) {
  const results = [];
  for (const row of rows) {
    const errors: string[] = [];
    if (!row.customerPhone) errors.push("Customer Phone is required");
    else { const pe = phoneError(row.customerPhone); if (pe) errors.push(`Customer Phone: ${pe}`); }
    if (!row.productCode) errors.push("Product Code is required");
    if (isNaN(Number(row.originalPrincipal)) || Number(row.originalPrincipal) <= 0) errors.push("Original Principal must be a positive number");
    if (isNaN(Number(row.interestRate)) || Number(row.interestRate) < 0) errors.push("Interest Rate must be a number ≥ 0");
    if (!INTEREST_METHODS.includes(row.interestMethod)) errors.push(`Interest Method must be one of: ${INTEREST_METHODS.join(", ")}`);
    if (!Number.isInteger(Number(row.termMonths)) || Number(row.termMonths) <= 0) errors.push("Term Months must be a positive whole number");
    if (!parseDate(row.disbursedDate)) errors.push("Disbursed Date is not a valid date");
    if (isNaN(Number(row.outstandingPrincipal)) || Number(row.outstandingPrincipal) < 0) errors.push("Outstanding Principal must be a number ≥ 0");
    if (isNaN(Number(row.outstandingInterest)) || Number(row.outstandingInterest) < 0) errors.push("Outstanding Interest must be a number ≥ 0");
    if (!Number.isInteger(Number(row.remainingInstallments)) || Number(row.remainingInstallments) <= 0) errors.push("Remaining Installments must be a positive whole number");
    if (!parseDate(row.nextDueDate)) errors.push("Next Due Date is not a valid date");

    let customer = null, productVersion = null;
    if (row.customerPhone && !phoneError(row.customerPhone)) {
      customer = await prisma.customer.findFirst({ where: { institutionId, phone: row.customerPhone } });
      if (!customer) errors.push(`No customer found with phone "${row.customerPhone}" — import customers first`);
    }
    if (row.productCode) {
      const product = await prisma.product.findFirst({ where: { institutionId, code: row.productCode, type: "LOAN" }, include: { currentVersion: true } });
      if (!product) errors.push(`No Loan product found with code "${row.productCode}"`);
      else if (product.status !== "ACTIVE") errors.push(`Product "${row.productCode}" is not currently active`);
      else productVersion = product.currentVersion;
    }

    results.push({ rowNumber: row.rowNumber, sheet: "Loans", data: row, status: (errors.length ? "error" : "valid") as "error" | "valid", errors, customerId: customer?.id, productVersionId: productVersion?.id });
  }
  return results;
}

migrationRouter.post("/loans/opening-balance/dry-run", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let rows: LoanOBRow[];
  try { rows = parseLoanOBWorkbook(req.file.buffer); }
  catch { return res.status(400).json({ error: "Could not read this file" }); }
  if (rows.length === 0) return res.status(400).json({ error: "No data rows found in the Loans sheet" });

  const results = await validateLoanOBRows(rows, req.auth!.institutionId);
  const summary = { total: results.length, valid: results.filter((r) => r.status === "valid").length, error: results.filter((r) => r.status === "error").length };

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.loans_opening_balance_dry_run", resource: "import_batch", metadata: { fileName: req.file.originalname, summary } },
  });

  res.json({ summary, results });
});

migrationRouter.post("/loans/opening-balance/commit", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let rows: LoanOBRow[];
  try { rows = parseLoanOBWorkbook(req.file.buffer); }
  catch { return res.status(400).json({ error: "Could not read this file" }); }

  const results = await validateLoanOBRows(rows, req.auth!.institutionId);
  const blockingErrors = results.filter((r) => r.status === "error");
  if (blockingErrors.length > 0) {
    return res.status(400).json({ error: "This file still has unresolved errors — fix them and re-run a dry-run before committing", errors: blockingErrors });
  }

  const batch = await prisma.importBatch.create({
    data: { institutionId: req.auth!.institutionId, entityType: "LOAN", method: "OPENING_BALANCE", status: "DRY_RUN", fileName: req.file.originalname, totalRows: results.length, successRows: 0, errorRows: 0, createdById: req.auth!.userId },
  });

  let successRows = 0;
  const rowErrors: { rowNumber: number; sheet: string; error: string }[] = [];

  for (const r of results) {
    try {
      const outstandingPrincipal = round2(Number(r.data.outstandingPrincipal));
      const outstandingInterest = round2(Number(r.data.outstandingInterest));
      const remainingInstallments = Number(r.data.remainingInstallments);
      const nextDueDate = parseDate(r.data.nextDueDate)!;
      const schedule = generateRemainingSchedule(outstandingPrincipal, outstandingInterest, remainingInstallments, nextDueDate);

      await prisma.$transaction(async (tx: any) => {
        const loan = await tx.loan.create({
          data: {
            institutionId: req.auth!.institutionId, customerId: r.customerId!, productVersionId: r.productVersionId!,
            principal: round2(Number(r.data.originalPrincipal)), interestRate: round2(Number(r.data.interestRate)),
            interestMethod: r.data.interestMethod, termMonths: Number(r.data.termMonths),
            status: "DISBURSED", disbursedAt: parseDate(r.data.disbursedDate)!, importBatchId: batch.id,
          },
        });
        await tx.loanInstallment.createMany({
          data: schedule.map((s) => ({
            loanId: loan.id, installmentNumber: s.installmentNumber, dueDate: s.dueDate,
            principalDue: s.principalDue, interestDue: s.interestDue, totalDue: round2(s.principalDue + s.interestDue),
          })),
        });
      });
      successRows++;
    } catch (err: any) {
      rowErrors.push({ rowNumber: r.rowNumber, sheet: "Loans", error: err.message || "Unknown error" });
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { status: rowErrors.length === 0 ? "COMMITTED" : "FAILED", successRows, errorRows: rowErrors.length, committedAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.loans_opening_balance_commit", resource: "import_batch", resourceId: batch.id, metadata: { successRows, errorRows: rowErrors.length } },
  });

  res.status(201).json({ batch, successRows, errorRows: rowErrors.length, rowErrors });
});

// -----------------------------------------------------------------------
// Full History — parsing, validation, commit
// -----------------------------------------------------------------------

interface LoanHeaderRow {
  rowNumber: number; externalRef: string; customerPhone: string; productCode: string;
  principal: string; interestRate: string; interestMethod: string; termMonths: string; disbursedDate: string;
}
interface RepaymentRow { rowNumber: number; externalRef: string; paymentDate: string; amount: string; }

function parseLoanFHWorkbook(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const headers: LoanHeaderRow[] = sheetToRows(wb, "Loan Headers")
    .map((r, i) => ({
      rowNumber: i + 2, externalRef: str(r[0]), customerPhone: str(r[1]), productCode: str(r[2]),
      principal: str(r[3]), interestRate: str(r[4]), interestMethod: str(r[5]).toUpperCase(), termMonths: str(r[6]), disbursedDate: str(r[7]),
    }))
    .filter((r) => r.externalRef || r.customerPhone);

  const repayments: RepaymentRow[] = sheetToRows(wb, "Repayment History")
    .map((r, i) => ({ rowNumber: i + 2, externalRef: str(r[0]), paymentDate: str(r[1]), amount: str(r[2]) }))
    .filter((r) => r.externalRef || r.amount);

  return { headers, repayments };
}

async function validateLoanFHRows(parsed: ReturnType<typeof parseLoanFHWorkbook>, institutionId: string) {
  const seenRefs = new Set<string>();
  const headerResults = [];

  for (const row of parsed.headers) {
    const errors: string[] = [];
    if (!row.externalRef) errors.push("External Loan Reference is required");
    else if (seenRefs.has(row.externalRef)) errors.push("Duplicate External Loan Reference within this file");
    if (row.externalRef) seenRefs.add(row.externalRef);
    if (!row.customerPhone) errors.push("Customer Phone is required");
    else { const pe = phoneError(row.customerPhone); if (pe) errors.push(`Customer Phone: ${pe}`); }
    if (!row.productCode) errors.push("Product Code is required");
    if (isNaN(Number(row.principal)) || Number(row.principal) <= 0) errors.push("Principal must be a positive number");
    if (isNaN(Number(row.interestRate)) || Number(row.interestRate) < 0) errors.push("Interest Rate must be a number ≥ 0");
    if (!INTEREST_METHODS.includes(row.interestMethod)) errors.push(`Interest Method must be one of: ${INTEREST_METHODS.join(", ")}`);
    if (!Number.isInteger(Number(row.termMonths)) || Number(row.termMonths) <= 0) errors.push("Term Months must be a positive whole number");
    if (!parseDate(row.disbursedDate)) errors.push("Disbursed Date is not a valid date");

    let customer = null, productVersion = null;
    if (row.customerPhone && !phoneError(row.customerPhone)) {
      customer = await prisma.customer.findFirst({ where: { institutionId, phone: row.customerPhone } });
      if (!customer) errors.push(`No customer found with phone "${row.customerPhone}" — import customers first`);
    }
    if (row.productCode) {
      const product = await prisma.product.findFirst({ where: { institutionId, code: row.productCode, type: "LOAN" }, include: { currentVersion: true } });
      if (!product) errors.push(`No Loan product found with code "${row.productCode}"`);
      else if (product.status !== "ACTIVE") errors.push(`Product "${row.productCode}" is not currently active`);
      else productVersion = product.currentVersion;
    }

    headerResults.push({ rowNumber: row.rowNumber, sheet: "Loan Headers", data: row, status: (errors.length ? "error" : "valid") as "error" | "valid", errors, customerId: customer?.id, productVersionId: productVersion?.id });
  }

  const knownRefs = new Set(parsed.headers.map((h) => h.externalRef));
  const repaymentResults = parsed.repayments.map((row) => {
    const errors: string[] = [];
    if (!row.externalRef) errors.push("External Loan Reference is required");
    else if (!knownRefs.has(row.externalRef)) errors.push(`External Loan Reference "${row.externalRef}" does not match any row in Loan Headers`);
    if (!parseDate(row.paymentDate)) errors.push("Payment Date is not a valid date");
    if (isNaN(Number(row.amount)) || Number(row.amount) <= 0) errors.push("Amount must be a positive number");
    return { rowNumber: row.rowNumber, sheet: "Repayment History", data: row, status: (errors.length ? "error" : "valid") as "error" | "valid", errors };
  });

  return { headerResults, repaymentResults };
}

migrationRouter.post("/loans/full-history/dry-run", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let parsed: ReturnType<typeof parseLoanFHWorkbook>;
  try { parsed = parseLoanFHWorkbook(req.file.buffer); }
  catch { return res.status(400).json({ error: "Could not read this file" }); }
  if (parsed.headers.length === 0) return res.status(400).json({ error: "No data rows found in the Loan Headers sheet" });

  const { headerResults, repaymentResults } = await validateLoanFHRows(parsed, req.auth!.institutionId);
  const summary = {
    headers: { total: headerResults.length, valid: headerResults.filter((r) => r.status === "valid").length, error: headerResults.filter((r) => r.status === "error").length },
    repayments: { total: repaymentResults.length, valid: repaymentResults.filter((r) => r.status === "valid").length, error: repaymentResults.filter((r) => r.status === "error").length },
  };

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.loans_full_history_dry_run", resource: "import_batch", metadata: { fileName: req.file.originalname, summary } },
  });

  res.json({ summary, headerResults, repaymentResults });
});

migrationRouter.post("/loans/full-history/commit", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let parsed: ReturnType<typeof parseLoanFHWorkbook>;
  try { parsed = parseLoanFHWorkbook(req.file.buffer); }
  catch { return res.status(400).json({ error: "Could not read this file" }); }

  const { headerResults, repaymentResults } = await validateLoanFHRows(parsed, req.auth!.institutionId);
  const allErrors = [...headerResults, ...repaymentResults].filter((r) => r.status === "error");
  if (allErrors.length > 0) {
    return res.status(400).json({ error: "This file still has unresolved errors — fix them and re-run a dry-run before committing", errors: allErrors });
  }

  const batch = await prisma.importBatch.create({
    data: { institutionId: req.auth!.institutionId, entityType: "LOAN", method: "FULL_HISTORY", status: "DRY_RUN", fileName: req.file.originalname, totalRows: headerResults.length, successRows: 0, errorRows: 0, createdById: req.auth!.userId },
  });

  let successRows = 0;
  const rowErrors: { rowNumber: number; sheet: string; error: string }[] = [];

  for (const h of headerResults) {
    try {
      const repaymentsForLoan = repaymentResults
        .filter((r) => r.data.externalRef === h.data.externalRef)
        .sort((a, b) => parseDate(a.data.paymentDate)!.getTime() - parseDate(b.data.paymentDate)!.getTime());

      const principal = round2(Number(h.data.principal));
      const interestRate = round2(Number(h.data.interestRate));
      const termMonths = Number(h.data.termMonths);
      const disbursedAt = parseDate(h.data.disbursedDate)!;
      const schedule = generateSchedule(principal, interestRate, termMonths, h.data.interestMethod, disbursedAt);

      await prisma.$transaction(async (tx: any) => {
        const loan = await tx.loan.create({
          data: {
            institutionId: req.auth!.institutionId, customerId: h.customerId!, productVersionId: h.productVersionId!,
            principal, interestRate, interestMethod: h.data.interestMethod, termMonths,
            status: "DISBURSED", disbursedAt, importBatchId: batch.id,
          },
        });
        const installments = await Promise.all(
          schedule.map((s) =>
            tx.loanInstallment.create({
              data: { loanId: loan.id, installmentNumber: s.installmentNumber, dueDate: s.dueDate, principalDue: s.principalDue, interestDue: s.interestDue, totalDue: round2(s.principalDue + s.interestDue) },
            })
          )
        );

        // Replay every historical repayment in date order through the exact
        // same allocation rule real-time repayments use (see lib/loanSchedule.ts).
        const installmentStates = installments.map((i: any) => ({ id: i.id, interestDue: Number(i.interestDue), principalDue: Number(i.principalDue), interestPaid: 0, principalPaid: 0, status: "PENDING" }));

        for (const rep of repaymentsForLoan) {
          const amount = round2(Number(rep.data.amount));
          const paidAt = parseDate(rep.data.paymentDate)!;
          await tx.loanRepayment.create({ data: { loanId: loan.id, amount, paidAt, recordedById: req.auth!.userId } });
          const updates = allocateRepayment(installmentStates, amount);
          for (const u of updates) {
            await tx.loanInstallment.update({ where: { id: u.id }, data: { interestPaid: u.newInterestPaid, principalPaid: u.newPrincipalPaid, status: u.newStatus } });
          }
        }

        const allPaid = installmentStates.length > 0 && installmentStates.every((i) => i.status === "PAID");
        if (allPaid) await tx.loan.update({ where: { id: loan.id }, data: { status: "CLOSED" } });
        else if (repaymentsForLoan.length > 0) await tx.loan.update({ where: { id: loan.id }, data: { status: "ACTIVE" } });
      });
      successRows++;
    } catch (err: any) {
      rowErrors.push({ rowNumber: h.rowNumber, sheet: "Loan Headers", error: err.message || "Unknown error" });
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { status: rowErrors.length === 0 ? "COMMITTED" : "FAILED", successRows, errorRows: rowErrors.length, committedAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.loans_full_history_commit", resource: "import_batch", resourceId: batch.id, metadata: { successRows, errorRows: rowErrors.length } },
  });

  res.status(201).json({ batch, successRows, errorRows: rowErrors.length, rowErrors });
});

migrationRouter.get("/batches", async (req: AuthedRequest, res) => {
  const batches = await prisma.importBatch.findMany({ where: { institutionId: req.auth!.institutionId }, orderBy: { createdAt: "desc" } });
  res.json({ batches });
});

// Undo — a genuine, direct soft-delete of every record tagged with this
// batch, deliberately NOT routed through the normal close/archive business
// rules (e.g. "balance must be zero before closing"). Those guards exist
// to stop a live customer from closing an account with money in it; they
// would actively BLOCK undo in exactly the case it's most needed — a bad
// import that brought in real, non-zero balances that were simply wrong.
// This is an explicit admin action reversing a demonstrably bad batch, not
// a normal business transition, so it bypasses those guards on purpose.
// A soft-delete, not a hard delete — the data still exists (deletedAt set,
// same as every other soft-delete in this app) and is fully auditable,
// but disappears from active use immediately. There is no "undo the undo"
// from this screen.
migrationRouter.post("/batches/:id/undo", async (req: AuthedRequest, res) => {
  const batch = await prisma.importBatch.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  if (batch.status === "REVERSED") return res.status(400).json({ error: "This batch has already been reversed" });
  if (batch.status === "DRY_RUN") return res.status(400).json({ error: "This batch was never committed — there's nothing to undo" });

  let affectedCount = 0;
  const now = new Date();

  if (batch.entityType === "CUSTOMER") {
    const result = await prisma.customer.updateMany({ where: { importBatchId: batch.id, deletedAt: null }, data: { deletedAt: now, archived: true } });
    affectedCount = result.count;
  } else if (batch.entityType === "SAVINGS_ACCOUNT") {
    const result = await prisma.savingsAccount.updateMany({ where: { importBatchId: batch.id, deletedAt: null }, data: { deletedAt: now } });
    affectedCount = result.count;
  } else if (batch.entityType === "LOAN") {
    const loans = await prisma.loan.findMany({ where: { importBatchId: batch.id, deletedAt: null }, select: { id: true } });
    const loanIds = loans.map((l) => l.id);
    if (loanIds.length > 0) {
      await prisma.loanInstallment.updateMany({ where: { loanId: { in: loanIds } }, data: { deletedAt: now } });
      await prisma.loanRepayment.updateMany({ where: { loanId: { in: loanIds } }, data: { deletedAt: now } });
      const result = await prisma.loan.updateMany({ where: { id: { in: loanIds } }, data: { deletedAt: now, status: "REJECTED" } });
      affectedCount = result.count;
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "REVERSED" } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "migration.batch_undo", resource: "import_batch", resourceId: batch.id, metadata: { entityType: batch.entityType, affectedCount } },
  });

  res.json({ ok: true, affectedCount });
});
