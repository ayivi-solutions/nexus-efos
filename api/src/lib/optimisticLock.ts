// PDDS Phase 3 named this as deliberately deferred: version_no increments
// correctly on every update (via the Prisma middleware in lib/prisma.ts),
// but nothing compared an incoming request's expected version against the
// current one before applying — meaning two people editing the same
// record at the same time could silently overwrite each other with no
// warning. This closes that gap for the genuine free-form multi-field
// edit endpoints where it actually matters (Customer, Employee, Role) —
// not Loan or Product, which turned out on inspection to have no general
// edit endpoint at all, only sequenced status-transition actions already
// protected by their own status checks.
export class VersionConflictError extends Error {
  currentVersion: number;
  constructor(currentVersion: number) {
    super("This record was changed by someone else since you loaded it");
    this.currentVersion = currentVersion;
  }
}

// expectedVersion is optional and backward-compatible on purpose: an
// older or unmodified client that doesn't send it skips the check
// entirely, rather than breaking every caller that hasn't been updated
// yet. Only callers that actually load and submit a version get the
// protection — see the frontend forms for Customer/Employee/Role.
export async function checkVersion(
  prisma: any,
  model: "customer" | "employee" | "role",
  id: string,
  expectedVersion: number | undefined
): Promise<void> {
  if (expectedVersion === undefined) return;
  const current = await prisma[model].findUnique({ where: { id }, select: { versionNo: true } });
  if (!current) return; // let the caller's own 404 logic handle a missing record
  if (current.versionNo !== expectedVersion) {
    throw new VersionConflictError(current.versionNo);
  }
}
