import { createClient } from "@supabase/supabase-js";

// doc §30/§69 — the file bytes for every document live here (private
// bucket), never inline in Postgres. Only metadata + a SHA-256 integrity
// checksum go in the Document table.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — document upload endpoints will fail.");
}

export const supabase = createClient(supabaseUrl || "", supabaseServiceKey || "");
export const DOCUMENTS_BUCKET = "kyc-documents";
