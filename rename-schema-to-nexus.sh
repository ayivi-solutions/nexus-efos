#!/usr/bin/env bash
set -euo pipefail
# Run from ~/Documents/GitHub/nexus-efos, on develop.
# Renames Postgres schema "nexusos" -> "nexus" throughout (your Supabase
# project uses one DB with multiple schemas, and you're calling this one
# "nexus"). Plain text substitution — safe regardless of line endings.

FILES=(
  "api/prisma/schema.prisma"
  "api/.env.example"
  "README.md"
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    sed -i 's/nexusos/nexus/g' "$f"
    echo "Updated: $f"
  else
    echo "Skipped (not found): $f"
  fi
done

echo ""
echo "Done. Verify with:"
echo "  grep -rn nexusos . --include='*.prisma' --include='*.example' --include='*.md'"
echo "(should return nothing)"
echo ""
echo "Then, from api/:"
echo "  cd api"
echo "  cp .env.example .env    # then edit .env: set DATABASE_URL to your real Supabase string, ?schema=nexus"
echo "  npm install"
echo "  npx prisma generate"
echo "  npx prisma migrate dev --name init"
echo "  npm run seed"
echo "  npm run dev"
