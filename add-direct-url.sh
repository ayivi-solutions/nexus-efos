#!/usr/bin/env bash
set -euo pipefail
# Run from ~/Documents/GitHub/nexus-efos, on develop.
# Wires DIRECT_URL into the Prisma datasource — Supabase's pooled connection
# (port 6543) can't run migration DDL, so Prisma needs the direct connection
# (port 5432) separately for `migrate dev`.

node -e '
const fs = require("fs");
const path = "api/prisma/schema.prisma";
let raw = fs.readFileSync(path, "utf8");
const hadCRLF = raw.includes("\r\n");
let c = raw.replace(/\r\n/g, "\n");
if (c.includes("directUrl")) { console.log("Already patched."); process.exit(0); }
const anchor = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["nexus"]
}`;
const repl = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["nexus"]
}`;
if ((c.split(anchor).length - 1) !== 1) { console.error("Anchor mismatch. Aborting — check schema.prisma manually."); process.exit(1); }
c = c.replace(anchor, repl);
if (hadCRLF) c = c.replace(/\n/g, "\r\n");
fs.writeFileSync(path, c);
console.log("Patched api/prisma/schema.prisma");
'

node -e '
const fs = require("fs");
const path = "api/.env.example";
let raw = fs.readFileSync(path, "utf8");
if (raw.includes("DIRECT_URL")) { console.log("Already patched."); process.exit(0); }
const anchor = "DATABASE_URL=\"postgresql://user:password@localhost:5432/ayivi_dev?schema=nexus\"";
if (!raw.includes(anchor)) { console.error("Anchor mismatch in .env.example. Aborting."); process.exit(1); }
const repl = anchor + "\nDIRECT_URL=\"postgresql://user:password@localhost:5432/ayivi_dev?schema=nexus\"  # Supabase: direct (non-pooled) connection, port 5432 — required for migrate dev";
fs.writeFileSync(path, raw.replace(anchor, repl));
console.log("Patched api/.env.example");
'

echo ""
echo "Done. In api/.env (not .env.example — your real one), make sure both are set:"
echo "  DATABASE_URL — Supabase pooled connection, port 6543, ?schema=nexus"
echo "  DIRECT_URL   — Supabase direct connection, port 5432, ?schema=nexus"
echo "Both are in Supabase → Project Settings → Database → Connection string (toggle Pooling on/off for each)."
echo ""
echo "Then:"
echo "  cd api"
echo "  npx prisma generate"
echo "  npx prisma migrate dev --name init"
