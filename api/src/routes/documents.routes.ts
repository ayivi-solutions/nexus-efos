import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { supabase, DOCUMENTS_BUCKET } from "../lib/supabase";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WEBP, or PDF files are allowed"));
  },
});

const DOCUMENT_TYPES = [
  "NATIONAL_ID", "PASSPORT", "DRIVERS_LICENCE", "VOTER_ID", "BUSINESS_REGISTRATION",
  "TAX_CERTIFICATE", "UTILITY_BILL", "PROOF_OF_ADDRESS", "PHOTOGRAPH", "SIGNATURE",
  "LOAN_DOCUMENT", "CONTRACT", "CONSENT_FORM", "OTHER",
] as const;

const uploadBodySchema = z.object({
  customerId: z.string(),
  documentType: z.enum(DOCUMENT_TYPES),
  documentName: z.string().optional(),
  category: z.string().optional(),
  expiryDate: z.string().optional(),
});

// doc §30 Customer Document Management, Technical Spec §69 Document Entity
// Architecture — Storage Reference + Checksum, never the file bytes, in Postgres.
documentsRouter.post("/", requirePermission("customers.update"), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const parsed = uploadBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, institutionId: req.auth!.institutionId } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  const documentId = crypto.randomUUID();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageReference = `${req.auth!.institutionId}/${customer.id}/${documentId}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storageReference, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const document = await prisma.document.create({
    data: {
      id: documentId,
      institutionId: req.auth!.institutionId,
      customerId: customer.id,
      documentName: parsed.data.documentName || req.file.originalname,
      documentType: parsed.data.documentType,
      category: parsed.data.category,
      storageReference,
      checksum,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined,
      status: "UPLOADED",
      uploadedById: req.auth!.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: req.auth!.institutionId,
      userId: req.auth!.userId,
      action: "document.upload",
      resource: "document",
      resourceId: document.id,
      metadata: { customerId: customer.id, documentType: parsed.data.documentType, checksum },
    },
  });

  res.status(201).json({ document });
});

// Signed URLs are generated fresh on every list call (5-minute expiry) —
// nothing about document access is ever a permanent public link.
documentsRouter.get("/", requirePermission("customers.view"), async (req: AuthedRequest, res) => {
  const { customerId } = req.query as { customerId?: string };
  if (!customerId) return res.status(400).json({ error: "customerId query param required" });

  const documents = await prisma.document.findMany({
    where: { customerId, institutionId: req.auth!.institutionId, status: { not: "DISPOSED" } },
    orderBy: { createdAt: "desc" },
  });

  const withUrls = await Promise.all(
    documents.map(async (d: (typeof documents)[number]) => {
      const { data } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(d.storageReference, 300);
      return { ...d, signedUrl: data?.signedUrl || null };
    })
  );

  res.json({ documents: withUrls });
});

documentsRouter.post("/:id/verify", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const doc = await prisma.document.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "VERIFIED" },
  });
  if (doc.count === 0) return res.status(404).json({ error: "Document not found" });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "document.verify", resource: "document", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

documentsRouter.post("/:id/archive", requirePermission("customers.update"), async (req: AuthedRequest, res) => {
  const doc = await prisma.document.updateMany({
    where: { id: req.params.id, institutionId: req.auth!.institutionId },
    data: { status: "ARCHIVED" },
  });
  if (doc.count === 0) return res.status(404).json({ error: "Document not found" });
  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "document.archive", resource: "document", resourceId: req.params.id },
  });
  res.json({ ok: true });
});

// Disposal actually deletes the file from storage (real disposal, not just
// a status flag) — the metadata row stays, marked DISPOSED, for audit history.
documentsRouter.delete("/:id", requirePermission("customers.delete"), async (req: AuthedRequest, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, institutionId: req.auth!.institutionId } });
  if (!document) return res.status(404).json({ error: "Document not found" });

  await supabase.storage.from(DOCUMENTS_BUCKET).remove([document.storageReference]);
  await prisma.document.update({ where: { id: document.id }, data: { status: "DISPOSED" } });

  await prisma.auditLog.create({
    data: { institutionId: req.auth!.institutionId, userId: req.auth!.userId, action: "document.dispose", resource: "document", resourceId: document.id },
  });
  res.status(204).send();
});
