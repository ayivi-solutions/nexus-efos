#!/usr/bin/env bash
set -euo pipefail

# Run from the root of your local clone: ~/Documents/GitHub/nexus-efos
# Finishes what apply-onboarding-wizard.sh started: the previous run aborted
# before patching lib/api.ts (Windows checks files out with CRLF line
# endings; the anchor match was written assuming LF and found nothing), so
# the wizard pages that got committed reference API methods that don't
# exist yet. This patches the 3 files it missed, CRLF-safe this time.

echo "== Patching web/lib/api.ts =="
node - << 'NODE_EOF'
const fs = require('fs');
const path = 'web/lib/api.ts';
let raw = fs.readFileSync(path, 'utf8');
const hadCRLF = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

const anchor = '  me: () => request("/institutions/me"),\n};';
const count = content.split(anchor).length - 1;
if (count === 0) {
  console.error('Anchor not found in ' + path + ' — file may already be patched. Checking...');
  if (content.includes('updateDetails:')) {
    console.log('Already patched. Skipping.');
    process.exit(0);
  }
  console.error('Not already patched either. Aborting — file has diverged, needs manual look.');
  process.exit(1);
}
if (count > 1) {
  console.error(`Expected 1 occurrence, found ${count}. Aborting.`);
  process.exit(1);
}

const replacement = `  me: () => request("/institutions/me"),

  updateDetails: (data: { regulatorId?: string; region?: string; phone?: string; email?: string }) =>
    request("/institutions/onboarding/details", { method: "PATCH", body: JSON.stringify(data) }),

  addBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/onboarding/branches", { method: "POST", body: JSON.stringify(data) }),

  listRoles: () => request("/roles"),

  inviteStaff: (data: { fullName: string; email: string; roleId: string; branchId?: string }) =>
    request("/institutions/onboarding/staff", { method: "POST", body: JSON.stringify(data) }),

  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),
};`;

content = content.replace(anchor, replacement);
if (hadCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(path, content);
console.log('Patched ' + path);
NODE_EOF

echo "== Patching web/app/onboarding/page.tsx =="
node - << 'NODE_EOF'
const fs = require('fs');
const path = 'web/app/onboarding/page.tsx';
let raw = fs.readFileSync(path, 'utf8');
const hadCRLF = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

const anchor = 'router.push("/dashboard");';
const count = content.split(anchor).length - 1;
if (count === 0) {
  if (content.includes('router.push("/onboarding/details")')) {
    console.log('Already patched. Skipping.');
    process.exit(0);
  }
  console.error('Anchor not found and not already patched. Aborting.');
  process.exit(1);
}
if (count > 1) {
  console.error(`Expected 1 occurrence, found ${count}. Aborting.`);
  process.exit(1);
}

content = content.replace(anchor, 'router.push("/onboarding/details");');
if (hadCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(path, content);
console.log('Patched ' + path);
NODE_EOF

echo "== Patching web/app/dashboard/page.tsx =="
node - << 'NODE_EOF'
const fs = require('fs');
const path = 'web/app/dashboard/page.tsx';
let raw = fs.readFileSync(path, 'utf8');
const hadCRLF = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

const anchor = `            <h1 className="font-display font-semibold text-4xl text-ink-900 mb-8">{institution.legalName}</h1>`;
const count = content.split(anchor).length - 1;
if (count === 0) {
  if (content.includes('continue setup')) {
    console.log('Already patched. Skipping.');
    process.exit(0);
  }
  console.error('Anchor not found and not already patched. Aborting.');
  process.exit(1);
}
if (count > 1) {
  console.error(`Expected 1 occurrence, found ${count}. Aborting.`);
  process.exit(1);
}

const replacement = anchor + `

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
            )}`;

content = content.replace(anchor, replacement);
if (hadCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(path, content);
console.log('Patched ' + path);
NODE_EOF

echo ""
echo "== Verifying: typecheck + build =="
cd web
npm install --silent
npx tsc --noEmit -p tsconfig.json
npx next build

echo ""
echo "All good. Review with 'git status' / 'git diff', then:"
echo "  git add -A"
echo "  git commit -m \"Wire onboarding wizard to API client and navigation\""
echo "  git push"
