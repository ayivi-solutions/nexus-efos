// PDDS §47 API Architecture Phase 3 — real API versioning. Every backend
// route now lives under /v1; appending it here once means none of the ~90
// individual request() call sites throughout this file need to change.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100") + "/v1";

async function rawFetch(path: string, options: RequestInit, accessToken: string | null) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
}

// Multipart upload — deliberately does NOT set Content-Type; the browser
// sets it automatically with the correct multipart boundary for FormData.
async function requestFormData(path: string, formData: FormData): Promise<any> {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed (${res.status})`);
  }
  return res.json();
}

// Binary file download (e.g. an .xlsx template) — needs the auth header
// like any other authenticated call, but the response is a blob, not JSON.
async function downloadFile(path: string, filename: string) {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });
  if (!res.ok) throw new Error(`Could not download file (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Endpoints that never require a token in the first place. A 401 from any
// of these means "wrong credentials" or "bad/expired invite token" — a
// real, specific error the person needs to see — not "your session
// expired," which was previously overriding every one of these with a
// misleading message. Found live: repeated "Session expired" toasts on
// the login page itself while just trying to sign in with the wrong
// password, which had nothing to do with a session at all.
const UNAUTHENTICATED_PATHS = [
  "/auth/login",
  "/auth/login/mfa",
  "/auth/mfa/setup-required",
  "/auth/mfa/verify-required",
  "/auth/register-institution",
  "/auth/accept-invite",
  "/auth/refresh",
  "/auth/logout",
];
// /auth/demo-link/:token is dynamic (the token is part of the path), so it
// can't sit in the exact-match list above — checked separately below.
function isUnauthenticatedPath(path: string) {
  return UNAUTHENTICATED_PATHS.includes(path) || path.startsWith("/auth/demo-link/");
}

async function request(path: string, options: RequestInit = {}, _retried = false): Promise<any> {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
  const res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && !_retried && typeof window !== "undefined" && !isUnauthenticatedPath(path)) {
    const refreshToken = sessionStorage.getItem("nexus_refresh_token");
    if (refreshToken) {
      try {
        const refreshRes = await rawFetch("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }, null);
        if (refreshRes.ok) {
          const { accessToken: newAccessToken } = await refreshRes.json();
          sessionStorage.setItem("nexus_access_token", newAccessToken);
          return request(path, options, true);
        }
      } catch {
        // fall through to session-expired handling below
      }
    }
    sessionStorage.removeItem("nexus_access_token");
    sessionStorage.removeItem("nexus_refresh_token");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=1";
      // Deliberately not throwing here. This used to throw "Session
      // expired," which every page's own catch block turned into a toast
      // via useErrorToast — so for a moment before the browser actually
      // finished navigating, people saw a "Session expired" popup flash
      // on screen even though the redirect to the login page (with its
      // own banner) was already underway. The redirect alone is the
      // correct, complete UX; returning a promise that never settles
      // means no caller's .catch/await ever runs, so nothing else fires
      // while the navigation completes.
      return new Promise(() => {});
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Device fingerprint — deliberately a simple persistent random ID stored
// in localStorage, not a real browser-fingerprinting library. Honest
// about what this is: an opaque per-browser-profile identifier the person
// implicitly controls (clearing storage resets it), not an unspoofable
// hardware attestation. See the trust-model caveats on UserDevice in
// api/prisma/schema.prisma — this is the client half of that disclosure.
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  const key = "nexus_device_fingerprint";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

export const api = {
  registerInstitution: (data: {
    legalName: string;
    tradingName?: string;
    type: string;
    adminFullName: string;
    adminEmail: string;
    adminPassword: string;
    setupKey: string;
  }) => request("/auth/register-institution", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string; deviceFingerprint?: string; trustDevice?: boolean }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  // PDDS Phase 4 — second step of login when MFA is already enrolled.
  loginMfa: (data: { mfaPendingToken: string; code: string; deviceFingerprint?: string; trustDevice?: boolean }) =>
    request("/auth/login/mfa", { method: "POST", body: JSON.stringify(data) }),

  // Mandatory first-time enrollment, reached mid-login when a role
  // requires MFA and the person has never set it up — distinct from
  // mfaSetup/mfaVerify below, which are for an already-signed-in user
  // adding MFA voluntarily.
  mfaSetupRequired: (mfaPendingToken: string) =>
    request("/auth/mfa/setup-required", { method: "POST", body: JSON.stringify({ mfaPendingToken }) }),

  mfaVerifyRequired: (data: { mfaPendingToken: string; code: string; deviceFingerprint?: string }) =>
    request("/auth/mfa/verify-required", { method: "POST", body: JSON.stringify(data) }),

  // Voluntary MFA management for an already-signed-in user.
  mfaSetup: () => request("/auth/mfa/setup", { method: "POST" }),
  mfaVerify: (code: string) => request("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  mfaDisable: (password: string) => request("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password }) }),
  listDevices: () => request("/auth/devices"),
  revokeDevice: (id: string) => request(`/auth/devices/${id}`, { method: "DELETE" }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),

  // Demo-link: createDemoLink is called once by whoever's sharing the demo
  // (needs to already be signed into the demo institution); resolveDemoLink
  // is called by the login page itself when someone opens the shared link.
  createDemoLink: (data: { email: string; password: string }) =>
    request("/auth/demo-link", { method: "POST", body: JSON.stringify(data) }),

  resolveDemoLink: (token: string) => request(`/auth/demo-link/${encodeURIComponent(token)}`),

  whoAmI: () => request("/auth/me"),

  acceptInvite: (data: { token: string; password: string }) =>
    request("/auth/accept-invite", { method: "POST", body: JSON.stringify(data) }),

  logout: () => {
    const refreshToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_refresh_token") : null;
    return request("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => {});
  },

  me: () => request("/institutions/me"),

  updateDetails: (data: { regulatorId?: string; region?: string; phone?: string; email?: string }) =>
    request("/institutions/onboarding/details", { method: "PATCH", body: JSON.stringify(data) }),

  addBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/onboarding/branches", { method: "POST", body: JSON.stringify(data) }),

  listRoles: () => request("/roles"),
  listPermissions: () => request("/roles/permissions"),
  assignRole: (data: { userId: string; roleId: string; branchId?: string; expiresAt?: string; isDelegated?: boolean }) =>
    request("/roles/assign", { method: "POST", body: JSON.stringify(data) }),
  revokeRole: (userRoleId: string) => request(`/roles/assign/${userRoleId}`, { method: "DELETE" }),
  updateRole: (
    id: string,
    data: { description?: string; permissionCodes?: string[]; requireMfa?: boolean; expectedVersion?: number }
  ) => request(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  createRole: (data: { name: string; description?: string; category: string; requireMfa?: boolean; permissionCodes?: string[] }) =>
    request("/roles", { method: "POST", body: JSON.stringify(data) }),

  inviteStaff: (data: { fullName: string; email: string; roleId: string; branchId?: string }) =>
    request("/institutions/onboarding/staff", { method: "POST", body: JSON.stringify(data) }),

  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),

  listUsers: () => request("/institutions/users"),
  suspendUser: (id: string) => request(`/institutions/users/${id}/suspend`, { method: "POST" }),
  reinstateUser: (id: string) => request(`/institutions/users/${id}/reinstate`, { method: "POST" }),

  listBranches: (includeArchived = false) => request(`/institutions/branches${includeArchived ? "?includeArchived=true" : ""}`),
  createBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/branches", { method: "POST", body: JSON.stringify(data) }),
  updateBranch: (id: string, data: any) => request(`/institutions/branches/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveBranch: (id: string) => request(`/institutions/branches/${id}/archive`, { method: "POST" }),
  unarchiveBranch: (id: string) => request(`/institutions/branches/${id}/unarchive`, { method: "POST" }),

  listEmployees: (includeArchived = false) => request(`/employees${includeArchived ? "?includeArchived=true" : ""}`),
  listDepartments: () => request("/departments"),
  createDepartment: (data: { name: string; code?: string }) => request("/departments", { method: "POST", body: JSON.stringify(data) }),
  deleteDepartment: (id: string) => request(`/departments/${id}`, { method: "DELETE" }),
  listPositions: () => request("/positions"),
  createPosition: (data: { title: string; departmentId?: string }) => request("/positions", { method: "POST", body: JSON.stringify(data) }),
  deletePosition: (id: string) => request(`/positions/${id}`, { method: "DELETE" }),
  createEmployee: (data: { fullName: string; email: string; branchId?: string; employeeNumber?: string; position?: string; department?: string; employmentType?: string }) =>
    request("/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: (id: string, data: any) => request(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveEmployee: (id: string) => request(`/employees/${id}/archive`, { method: "POST" }),
  unarchiveEmployee: (id: string) => request(`/employees/${id}/unarchive`, { method: "POST" }),
  grantAccess: (employeeId: string, data: { roleId: string; branchId?: string }) =>
    request(`/employees/${employeeId}/grant-access`, { method: "POST", body: JSON.stringify(data) }),

  listCustomers: (opts?: { includeArchived?: boolean; search?: string; watchlistFlag?: boolean; possibleDuplicate?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.includeArchived) params.set("includeArchived", "true");
    if (opts?.search) params.set("search", opts.search);
    if (opts?.watchlistFlag) params.set("watchlistFlag", "true");
    if (opts?.possibleDuplicate) params.set("possibleDuplicate", "true");
    const qs = params.toString();
    return request(`/customers${qs ? `?${qs}` : ""}`);
  },
  getCustomer: (id: string) => request(`/customers/${id}`),
  createCustomer: (data: { fullName: string; phone: string; email?: string; segment: string; branchId?: string; address?: string }) =>
    request("/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: any) => request(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archiveCustomer: (id: string, data: { closureReason: string; closureNote?: string }) => request(`/customers/${id}/archive`, { method: "POST", body: JSON.stringify(data) }),
  unarchiveCustomer: (id: string) => request(`/customers/${id}/unarchive`, { method: "POST" }),
  clearDuplicateFlag: (id: string) => request(`/customers/${id}/clear-duplicate-flag`, { method: "POST" }),

  addNextOfKin: (customerId: string, data: any) => request(`/customers/${customerId}/next-of-kin`, { method: "POST", body: JSON.stringify(data) }),
  deleteNextOfKin: (customerId: string, kinId: string) => request(`/customers/${customerId}/next-of-kin/${kinId}`, { method: "DELETE" }),
  addCustomerNote: (customerId: string, note: string) => request(`/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify({ note }) }),
  addBeneficiary: (customerId: string, data: any) => request(`/customers/${customerId}/beneficiaries`, { method: "POST", body: JSON.stringify(data) }),
  deleteBeneficiary: (customerId: string, beneficiaryId: string) => request(`/customers/${customerId}/beneficiaries/${beneficiaryId}`, { method: "DELETE" }),
  addBeneficialOwner: (customerId: string, data: any) => request(`/customers/${customerId}/beneficial-owners`, { method: "POST", body: JSON.stringify(data) }),
  deleteBeneficialOwner: (customerId: string, ownerId: string) => request(`/customers/${customerId}/beneficial-owners/${ownerId}`, { method: "DELETE" }),

  listApprovals: (status?: string) => request(`/approvals${status ? `?status=${status}` : ""}`),
  approveRequest: (id: string, resolutionNote?: string) => request(`/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ resolutionNote }) }),
  rejectRequest: (id: string, resolutionNote?: string) => request(`/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ resolutionNote }) }),

  listWatchlist: () => request("/watchlist"),
  addWatchlistEntry: (data: { fullName: string; idNumber?: string; reason?: string }) => request("/watchlist", { method: "POST", body: JSON.stringify(data) }),
  deleteWatchlistEntry: (id: string) => request(`/watchlist/${id}`, { method: "DELETE" }),

  uploadDocument: (formData: FormData) => requestFormData("/documents", formData),
  replaceDocument: (id: string, formData: FormData) => requestFormData(`/documents/${id}/replace`, formData),
  listDocuments: (customerId: string) => request(`/documents?customerId=${customerId}`),
  verifyDocument: (id: string) => request(`/documents/${id}/verify`, { method: "POST" }),
  archiveDocument: (id: string) => request(`/documents/${id}/archive`, { method: "POST" }),
  disposeDocument: (id: string) => request(`/documents/${id}`, { method: "DELETE" }),

  updateCustomerStage: (id: string, lifecycleStage: string) =>
    request(`/customers/${id}/stage`, { method: "PATCH", body: JSON.stringify({ lifecycleStage }) }),
  updateCustomerKyc: (id: string, kycStatus: string) =>
    request(`/customers/${id}/kyc`, { method: "PATCH", body: JSON.stringify({ kycStatus }) }),
  updateCustomerCdd: (id: string, data: { pepStatus?: string; cddNotes?: string }) =>
    request(`/customers/${id}/cdd`, { method: "PATCH", body: JSON.stringify(data) }),
  getKycChecklist: (id: string) => request(`/customers/${id}/kyc-checklist`),
  updateCustomerStatus: (id: string, status: string) =>
    request(`/customers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  listLoans: () => request("/loans"),
  getLoan: (id: string) => request(`/loans/${id}`),
  addLoanHolder: (id: string, data: { customerId: string; role: string }) => request(`/loans/${id}/holders`, { method: "POST", body: JSON.stringify(data) }),
  removeLoanHolder: (id: string, holderId: string) => request(`/loans/${id}/holders/${holderId}`, { method: "DELETE" }),
  createLoan: (data: { customerId: string; productVersionId: string; principal: number; termMonths: number }) =>
    request("/loans", { method: "POST", body: JSON.stringify(data) }),
  approveLoan: (id: string) => request(`/loans/${id}/approve`, { method: "POST" }),
  rejectLoan: (id: string) => request(`/loans/${id}/reject`, { method: "POST" }),
  disburseLoan: (id: string) => request(`/loans/${id}/disburse`, { method: "POST" }),
  recordRepayment: (id: string, amount: number) => request(`/loans/${id}/repayments`, { method: "POST", body: JSON.stringify({ amount }) }),

  listPromisesToPay: (loanId: string) => request(`/loans/${loanId}/promises-to-pay`),
  recordPromiseToPay: (loanId: string, data: { promisedAmount: number; promisedDate: string; notes?: string }) =>
    request(`/loans/${loanId}/promises-to-pay`, { method: "POST", body: JSON.stringify(data) }),
  updatePromiseToPayStatus: (promiseId: string, status: "KEPT" | "BROKEN") =>
    request(`/loans/promises-to-pay/${promiseId}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  listLoanPenalties: (loanId: string) => request(`/loans/${loanId}/penalties`),
  applyLoanPenalty: (loanId: string, data: { calculationMethod: "FIXED" | "PERCENTAGE"; rateOrAmount: number }) =>
    request(`/loans/${loanId}/penalties`, { method: "POST", body: JSON.stringify(data) }),
  waiveLoanPenalty: (penaltyId: string, reason?: string) => request(`/loans/penalties/${penaltyId}/waive`, { method: "POST", body: JSON.stringify({ reason }) }),
  reverseLoanPenalty: (penaltyId: string, reason?: string) => request(`/loans/penalties/${penaltyId}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }),

  runArrearsCheckNow: () => request("/loans/arrears-check/run-now", { method: "POST" }),

  getCreditAssessment: (loanId: string) => request(`/loans/${loanId}/credit-assessment`),
  createCreditAssessment: (loanId: string, data: { monthlyIncome: number; monthlyExpenses: number; creditBureauChecked?: boolean; creditBureauNotes?: string }) =>
    request(`/loans/${loanId}/credit-assessment`, { method: "POST", body: JSON.stringify(data) }),
  overrideCreditAssessment: (loanId: string, reason: string) => request(`/loans/${loanId}/credit-assessment/override`, { method: "POST", body: JSON.stringify({ reason }) }),

  listGuarantors: (loanId: string) => request(`/loans/${loanId}/guarantors`),
  addGuarantor: (loanId: string, data: any) => request(`/loans/${loanId}/guarantors`, { method: "POST", body: JSON.stringify(data) }),
  approveGuarantor: (guarantorId: string) => request(`/loans/guarantors/${guarantorId}/approve`, { method: "POST" }),
  releaseGuarantor: (guarantorId: string, reason?: string) => request(`/loans/guarantors/${guarantorId}/release`, { method: "POST", body: JSON.stringify({ reason }) }),

  listCollateral: (loanId: string) => request(`/loans/${loanId}/collateral`),
  addCollateral: (loanId: string, data: any) => request(`/loans/${loanId}/collateral`, { method: "POST", body: JSON.stringify(data) }),
  revalueCollateral: (collateralId: string, estimatedValue: number) => request(`/loans/collateral/${collateralId}/revalue`, { method: "POST", body: JSON.stringify({ estimatedValue }) }),
  releaseCollateral: (collateralId: string, reason?: string) => request(`/loans/collateral/${collateralId}/release`, { method: "POST", body: JSON.stringify({ reason }) }),
  realiseCollateral: (collateralId: string, realisedAmount: number) => request(`/loans/collateral/${collateralId}/realise`, { method: "POST", body: JSON.stringify({ realisedAmount }) }),

  requestRestructure: (loanId: string, data: { newPrincipal: number; newRate: number; newTermMonths: number; reason: string }) => request(`/loans/${loanId}/restructure`, { method: "POST", body: JSON.stringify(data) }),
  listRestructures: (loanId: string) => request(`/loans/${loanId}/restructures`),
  requestReschedule: (loanId: string, data: { shiftDays: number; reason: string }) => request(`/loans/${loanId}/reschedule`, { method: "POST", body: JSON.stringify(data) }),
  listReschedules: (loanId: string) => request(`/loans/${loanId}/reschedules`),
  requestWriteOff: (loanId: string, data: { amount: number; reason: string }) => request(`/loans/${loanId}/write-off`, { method: "POST", body: JSON.stringify(data) }),
  listWriteOffs: (loanId: string) => request(`/loans/${loanId}/write-offs`),
  recordWriteOffRecovery: (writeOffId: string, amount: number) => request(`/loans/write-offs/${writeOffId}/record-recovery`, { method: "POST", body: JSON.stringify({ amount }) }),

  listCollectors: () => request("/collections/collectors"),
  registerCollector: (data: { employeeId: string; branchId?: string }) => request("/collections/collectors", { method: "POST", body: JSON.stringify(data) }),
  transferCollector: (id: string, branchId: string) => request(`/collections/collectors/${id}/transfer`, { method: "PATCH", body: JSON.stringify({ branchId }) }),
  suspendCollector: (id: string, reason?: string) => request(`/collections/collectors/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
  reinstateCollector: (id: string) => request(`/collections/collectors/${id}/reinstate`, { method: "POST" }),
  setCollectorAvailability: (id: string, availability: "AVAILABLE" | "ON_LEAVE") => request(`/collections/collectors/${id}/availability`, { method: "PATCH", body: JSON.stringify({ availability }) }),

  listCollectionRoutes: () => request("/collections/routes"),
  createCollectionRoute: (data: { name: string; branchId?: string; collectorId?: string; isTemporary?: boolean }) => request("/collections/routes", { method: "POST", body: JSON.stringify(data) }),
  reassignRouteCollector: (routeId: string, collectorId: string | null) => request(`/collections/routes/${routeId}/collector`, { method: "PATCH", body: JSON.stringify({ collectorId }) }),
  assignCustomerToRoute: (routeId: string, customerId: string, sequence?: number) => request(`/collections/routes/${routeId}/customers`, { method: "POST", body: JSON.stringify({ customerId, sequence }) }),
  removeCustomerFromRoute: (routeId: string, assignmentId: string) => request(`/collections/routes/${routeId}/customers/${assignmentId}`, { method: "DELETE" }),

  listCollectionTransactions: () => request("/collections/transactions"),
  recordCollection: (data: any) => request("/collections/transactions", { method: "POST", body: JSON.stringify(data) }),
  reverseCollection: (id: string, reason: string) => request(`/collections/transactions/${id}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }),

  listSettlements: () => request("/collections/settlements"),
  recordSettlement: (data: { collectorId: string; settlementDate: string; actualAmount: number; notes?: string }) => request("/collections/settlements", { method: "POST", body: JSON.stringify(data) }),

  listCommissionStructures: () => request("/collections/commission-structures"),
  createCommissionStructure: (data: { name: string; type: string; rate: number }) => request("/collections/commission-structures", { method: "POST", body: JSON.stringify(data) }),
  listCommissionRecords: () => request("/collections/commission-records"),
  calculateCommission: (data: { collectorId: string; structureId: string; periodStart: string; periodEnd: string }) => request("/collections/commission-records/calculate", { method: "POST", body: JSON.stringify(data) }),
  requestCommissionPayment: (id: string) => request(`/collections/commission-records/${id}/request-payment`, { method: "POST" }),
  getCollectionsReport: (from?: string, to?: string) => request(`/collections/reports/summary${from ? `?from=${from}&to=${to}` : ""}`),

  listSavingsFeeTypes: () => request("/savings/fee-types"),
  createSavingsFeeType: (data: any) => request("/savings/fee-types", { method: "POST", body: JSON.stringify(data) }),
  listSavingsFeeCharges: (accountId: string) => request(`/savings/${accountId}/fee-charges`),
  applySavingsFee: (accountId: string, feeTypeId: string) => request(`/savings/${accountId}/fee-charges`, { method: "POST", body: JSON.stringify({ feeTypeId }) }),
  waiveSavingsFee: (chargeId: string, reason?: string) => request(`/savings/fee-charges/${chargeId}/waive`, { method: "POST", body: JSON.stringify({ reason }) }),

  listSavingsRestrictions: (accountId: string) => request(`/savings/${accountId}/restrictions`),
  createSavingsRestriction: (accountId: string, data: { type: string; reason: string; expiresAt?: string }) => request(`/savings/${accountId}/restrictions`, { method: "POST", body: JSON.stringify(data) }),
  requestRestrictionRemoval: (restrictionId: string, reason?: string) => request(`/savings/restrictions/${restrictionId}/request-removal`, { method: "POST", body: JSON.stringify({ reason }) }),

  listStandingInstructions: () => request("/savings/standing-instructions"),
  createStandingInstruction: (data: any) => request("/savings/standing-instructions", { method: "POST", body: JSON.stringify(data) }),
  listSIExecutions: (id: string) => request(`/savings/standing-instructions/${id}/executions`),
  suspendSI: (id: string) => request(`/savings/standing-instructions/${id}/suspend`, { method: "POST" }),
  reactivateSI: (id: string) => request(`/savings/standing-instructions/${id}/reactivate`, { method: "POST" }),
  cancelSI: (id: string) => request(`/savings/standing-instructions/${id}/cancel`, { method: "POST" }),

  listSavingsStatements: (accountId: string) => request(`/savings/${accountId}/statements`),
  generateSavingsStatement: async (accountId: string, periodStart: string, periodEnd: string) => {
    const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
    const res = await fetch(`${API_BASE}/savings/${accountId}/statements/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ periodStart, periodEnd }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Could not generate statement"); }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `statement-${accountId}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  },
  downloadSavingsStatement: async (statementId: string, accountNumber: string) => {
    const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
    const res = await fetch(`${API_BASE}/savings/statements/${statementId}/download`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) throw new Error("Could not download statement");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `statement-${accountNumber}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  },

  listVaults: () => request("/cash-vault/vaults"),
  createVault: (data: { branchId: string; name: string }) => request("/cash-vault/vaults", { method: "POST", body: JSON.stringify(data) }),
  openVault: (id: string) => request(`/cash-vault/vaults/${id}/open`, { method: "POST" }),
  closeVault: (id: string) => request(`/cash-vault/vaults/${id}/close`, { method: "POST" }),
  listVaultLedger: (id: string) => request(`/cash-vault/vaults/${id}/ledger`),
  recordVaultCash: (id: string, data: { type: "RECEIPT" | "WITHDRAWAL"; amount: number; notes?: string }) => request(`/cash-vault/vaults/${id}/ledger`, { method: "POST", body: JSON.stringify(data) }),

  listTellers: () => request("/cash-vault/tellers"),
  registerTeller: (data: { employeeId: string; vaultId?: string; cashLimit: number }) => request("/cash-vault/tellers", { method: "POST", body: JSON.stringify(data) }),
  updateTellerLimit: (id: string, cashLimit: number) => request(`/cash-vault/tellers/${id}/limit`, { method: "PATCH", body: JSON.stringify({ cashLimit }) }),
  suspendTeller: (id: string, reason?: string) => request(`/cash-vault/tellers/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
  reinstateTeller: (id: string) => request(`/cash-vault/tellers/${id}/reinstate`, { method: "POST" }),

  listCashTransfers: () => request("/cash-vault/transfers"),
  requestCashTransfer: (data: any) => request("/cash-vault/transfers", { method: "POST", body: JSON.stringify(data) }),

  listCashBalancings: () => request("/cash-vault/balancings"),
  recordCashBalancing: (data: any) => request("/cash-vault/balancings", { method: "POST", body: JSON.stringify(data) }),

  listCheques: (filters?: { direction?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.direction) qs.set("direction", filters.direction);
    if (filters?.status) qs.set("status", filters.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/cheques${suffix}`);
  },
  listPendingConfirmationCheques: () => request("/cheques/pending-confirmation"),
  recordCheque: (data: {
    direction: "INWARD" | "OUTWARD";
    chequeNumber: string;
    bankName: string;
    chequeDate: string;
    amount: number;
    payerName?: string;
    payeeName?: string;
    customerId?: string;
    savingsAccountId?: string;
    loanId?: string;
  }) => request("/cheques", { method: "POST", body: JSON.stringify(data) }),
  confirmCheque: (id: string) => request(`/cheques/${id}/confirm`, { method: "POST" }),
  submitChequeForClearing: (id: string) => request(`/cheques/${id}/submit-clearing`, { method: "POST" }),
  clearCheque: (id: string) => request(`/cheques/${id}/clear`, { method: "POST" }),
  bounceCheque: (id: string, reason: string) => request(`/cheques/${id}/bounce`, { method: "POST", body: JSON.stringify({ reason }) }),
  stopCheque: (id: string) => request(`/cheques/${id}/stop`, { method: "POST" }),
  cancelCheque: (id: string) => request(`/cheques/${id}/cancel`, { method: "POST" }),

  listInteractions: (filters?: { customerId?: string; dueForFollowUp?: boolean }) => {
    const qs = new URLSearchParams();
    if (filters?.customerId) qs.set("customerId", filters.customerId);
    if (filters?.dueForFollowUp) qs.set("dueForFollowUp", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/crm/interactions${suffix}`);
  },
  recordInteraction: (data: { customerId: string; channel: string; summary: string; followUpScheduledAt?: string }) =>
    request("/crm/interactions", { method: "POST", body: JSON.stringify(data) }),
  completeFollowUp: (id: string, notes?: string) => request(`/crm/interactions/${id}/complete-follow-up`, { method: "POST", body: JSON.stringify({ notes }) }),

  listComplaints: (filters?: { customerId?: string; status?: string; escalatedOnly?: boolean }) => {
    const qs = new URLSearchParams();
    if (filters?.customerId) qs.set("customerId", filters.customerId);
    if (filters?.status) qs.set("status", filters.status);
    if (filters?.escalatedOnly) qs.set("escalatedOnly", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/crm/complaints${suffix}`);
  },
  registerComplaint: (data: { customerId: string; category: string; priority?: string; description: string; assignedToId?: string }) =>
    request("/crm/complaints", { method: "POST", body: JSON.stringify(data) }),
  investigateComplaint: (id: string, data: { assignedToId?: string; investigationNotes?: string }) =>
    request(`/crm/complaints/${id}/investigate`, { method: "POST", body: JSON.stringify(data) }),
  resolveComplaint: (id: string, data: { resolutionNotes: string; customerNotified?: boolean }) =>
    request(`/crm/complaints/${id}/resolve`, { method: "POST", body: JSON.stringify(data) }),
  closeComplaint: (id: string) => request(`/crm/complaints/${id}/close`, { method: "POST" }),

  listAttendance: (filters?: { employeeId?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.employeeId) qs.set("employeeId", filters.employeeId);
    if (filters?.from) qs.set("from", filters.from);
    if (filters?.to) qs.set("to", filters.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/hr/attendance${suffix}`);
  },
  clockIn: (employeeId: string, method?: "MANUAL" | "REMOTE") => request("/hr/attendance/clock-in", { method: "POST", body: JSON.stringify({ employeeId, method }) }),
  clockOut: (id: string) => request(`/hr/attendance/${id}/clock-out`, { method: "POST" }),
  requestAttendanceCorrection: (id: string, data: { proposedClockInAt?: string; proposedClockOutAt?: string; reason: string }) =>
    request(`/hr/attendance/${id}/request-correction`, { method: "POST", body: JSON.stringify(data) }),

  listPerformanceReviews: (employeeId?: string) => request(`/hr/performance-reviews${employeeId ? `?employeeId=${employeeId}` : ""}`),
  createPerformanceReview: (data: { employeeId: string; reviewerId: string; cycleLabel: string; goals?: string }) =>
    request("/hr/performance-reviews", { method: "POST", body: JSON.stringify(data) }),
  submitSelfAssessment: (id: string, selfAssessment: string) => request(`/hr/performance-reviews/${id}/self-assessment`, { method: "POST", body: JSON.stringify({ selfAssessment }) }),
  submitManagerAssessment: (id: string, data: { managerAssessment: string; rating: string; developmentPlan?: string }) =>
    request(`/hr/performance-reviews/${id}/manager-assessment`, { method: "POST", body: JSON.stringify(data) }),

  listDisciplinaryCases: (filters?: { employeeId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.employeeId) qs.set("employeeId", filters.employeeId);
    if (filters?.status) qs.set("status", filters.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/hr/disciplinary-cases${suffix}`);
  },
  raiseDisciplinaryCase: (data: { employeeId: string; misconductDescription: string }) => request("/hr/disciplinary-cases", { method: "POST", body: JSON.stringify(data) }),
  investigateDisciplinaryCase: (id: string, investigationNotes?: string) => request(`/hr/disciplinary-cases/${id}/investigate`, { method: "POST", body: JSON.stringify({ investigationNotes }) }),
  resolveDisciplinaryCase: (id: string, actionTaken: string) => request(`/hr/disciplinary-cases/${id}/resolve`, { method: "POST", body: JSON.stringify({ actionTaken }) }),
  closeDisciplinaryCase: (id: string) => request(`/hr/disciplinary-cases/${id}/close`, { method: "POST" }),

  listAuditEngagements: (status?: string) => request(`/internal-audit/engagements${status ? `?status=${status}` : ""}`),
  createAuditEngagement: (data: { type: string; branchId?: string; leadAuditor: string; scope: string; plannedStartDate: string }) =>
    request("/internal-audit/engagements", { method: "POST", body: JSON.stringify(data) }),
  requestAuditEngagementApproval: (id: string) => request(`/internal-audit/engagements/${id}/request-approval`, { method: "POST" }),
  setAuditEngagementStatus: (id: string, status: string) => request(`/internal-audit/engagements/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  rateAuditEngagement: (id: string, rating: string) => request(`/internal-audit/engagements/${id}/rate`, { method: "POST", body: JSON.stringify({ rating }) }),
  closeAuditEngagement: (id: string) => request(`/internal-audit/engagements/${id}/close`, { method: "POST" }),

  listAuditFindings: (filters?: { engagementId?: string; status?: string; overdueOnly?: boolean }) => {
    const qs = new URLSearchParams();
    if (filters?.engagementId) qs.set("engagementId", filters.engagementId);
    if (filters?.status) qs.set("status", filters.status);
    if (filters?.overdueOnly) qs.set("overdueOnly", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/internal-audit/findings${suffix}`);
  },
  registerAuditFinding: (data: { engagementId: string; description: string; riskClassification: string; rootCauseAnalysis?: string; recommendation: string; actionOwnerId?: string; targetRemediationDate?: string }) =>
    request("/internal-audit/findings", { method: "POST", body: JSON.stringify(data) }),
  respondToAuditFinding: (id: string, data: { managementResponse: string; actionOwnerId?: string; targetRemediationDate?: string }) =>
    request(`/internal-audit/findings/${id}/respond`, { method: "POST", body: JSON.stringify(data) }),
  markAuditFindingImplemented: (id: string) => request(`/internal-audit/findings/${id}/mark-implemented`, { method: "POST" }),
  verifyAuditFinding: (id: string) => request(`/internal-audit/findings/${id}/verify`, { method: "POST" }),
  closeAuditFinding: (id: string) => request(`/internal-audit/findings/${id}/close`, { method: "POST" }),

  listGLAccounts: () => request("/general-ledger/accounts"),
  createGLAccount: (data: any) => request("/general-ledger/accounts", { method: "POST", body: JSON.stringify(data) }),
  setGLAccountStatus: (id: string, status: "ACTIVE" | "INACTIVE") => request(`/general-ledger/accounts/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  listJournals: () => request("/general-ledger/journals"),
  createJournal: (data: any) => request("/general-ledger/journals", { method: "POST", body: JSON.stringify(data) }),
  requestJournalPosting: (id: string) => request(`/general-ledger/journals/${id}/request-posting`, { method: "POST" }),

  listRecurringJournals: () => request("/general-ledger/recurring-journals"),
  createRecurringJournal: (data: any) => request("/general-ledger/recurring-journals", { method: "POST", body: JSON.stringify(data) }),
  requestRecurringActivation: (id: string) => request(`/general-ledger/recurring-journals/${id}/request-activation`, { method: "POST" }),
  suspendRecurringJournal: (id: string) => request(`/general-ledger/recurring-journals/${id}/suspend`, { method: "POST" }),
  reactivateRecurringJournal: (id: string) => request(`/general-ledger/recurring-journals/${id}/reactivate`, { method: "POST" }),

  getTrialBalance: (range: string, from?: string, to?: string) => request(`/general-ledger/reports/trial-balance?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),
  getBalanceSheet: (range: string, from?: string, to?: string) => request(`/general-ledger/reports/balance-sheet?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),
  getIncomeStatement: (range: string, from?: string, to?: string) => request(`/general-ledger/reports/income-statement?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),
  getChangesInEquity: (range: string, from?: string, to?: string) => request(`/general-ledger/reports/changes-in-equity?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),

  classifyGLAccount: (id: string, data: any) => request(`/general-ledger/accounts/${id}/classify`, { method: "POST", body: JSON.stringify(data) }),
  getCashFlowStatement: (range: string, from?: string, to?: string) => request(`/general-ledger/reports/cash-flow?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),
  getNplRatio: () => request("/general-ledger/reports/npl-ratio"),
  getLiquidityRatio: () => request("/general-ledger/reports/liquidity-ratio"),
  getBogPublicationSummary: () => request("/general-ledger/reports/bog-publication-summary"),

  getAccountActivity: (accountId: string, range: string, from?: string, to?: string) => request(`/general-ledger/reports/account-activity/${accountId}?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),
  getGLByBranch: (range: string, from?: string, to?: string) => request(`/general-ledger/reports/by-branch?range=${range}${from ? `&from=${from}&to=${to}` : ""}`),
  getGLByPeriod: () => request("/general-ledger/reports/by-period"),
  getGLDashboard: () => request("/general-ledger/reports/dashboard"),

  listSettlementAccounts: () => request("/inter-branch/settlement-accounts"),
  createSettlementAccount: (data: any) => request("/inter-branch/settlement-accounts", { method: "POST", body: JSON.stringify(data) }),
  listInterBranchTransfers: () => request("/inter-branch/transfers"),
  requestInterBranchTransfer: (data: any) => request("/inter-branch/transfers", { method: "POST", body: JSON.stringify(data) }),
  getOutstandingBalances: () => request("/inter-branch/reports/outstanding-balances"),

  getProfitabilityTrend: (months?: number) => request(`/analytics/trends/profitability${months ? `?months=${months}` : ""}`),
  getNetIncomeForecast: (months?: number) => request(`/analytics/forecast/net-income${months ? `?months=${months}` : ""}`),
  getBranchPerformance: () => request("/analytics/branch-performance"),

  getPortfolioOverview: () => request("/analytics/portfolio/overview"),
  getPortfolioAging: () => request("/analytics/portfolio/aging"),
  getPortfolioByBranch: () => request("/analytics/portfolio/by-branch"),
  getPortfolioByProduct: () => request("/analytics/portfolio/by-product"),
  getPortfolioConcentration: (limit = 10) => request(`/analytics/portfolio/concentration?limit=${limit}`),

  getCapitalAdequacyLive: () => request("/capital-adequacy/live"),
  listCapitalAdequacySnapshots: () => request("/capital-adequacy/snapshots"),
  createCapitalAdequacySnapshot: (asOfDate: string) => request("/capital-adequacy/snapshots", { method: "POST", body: JSON.stringify({ asOfDate }) }),
  getCreditConcentrationRisk: () => request("/capital-adequacy/concentration"),

  listPayrollCalendars: () => request("/payroll/calendars"),
  createPayrollCalendar: (data: any) => request("/payroll/calendars", { method: "POST", body: JSON.stringify(data) }),
  listPayrollPeriods: () => request("/payroll/periods"),
  createPayrollPeriod: (data: any) => request("/payroll/periods", { method: "POST", body: JSON.stringify(data) }),
  listSalaryGrades: () => request("/payroll/salary-grades"),
  createSalaryGrade: (data: any) => request("/payroll/salary-grades", { method: "POST", body: JSON.stringify(data) }),
  listPayGroups: () => request("/payroll/pay-groups"),
  createPayGroup: (data: any) => request("/payroll/pay-groups", { method: "POST", body: JSON.stringify(data) }),
  listEarningCodes: () => request("/payroll/earning-codes"),
  createEarningCode: (data: any) => request("/payroll/earning-codes", { method: "POST", body: JSON.stringify(data) }),
  listDeductionCodes: () => request("/payroll/deduction-codes"),
  createDeductionCode: (data: any) => request("/payroll/deduction-codes", { method: "POST", body: JSON.stringify(data) }),
  listOvertimeRules: () => request("/payroll/overtime-rules"),
  createOvertimeRule: (data: any) => request("/payroll/overtime-rules", { method: "POST", body: JSON.stringify(data) }),
  listTaxTables: () => request("/payroll/tax-tables"),
  createTaxTable: (data: any) => request("/payroll/tax-tables", { method: "POST", body: JSON.stringify(data) }),
  listStatutoryRates: () => request("/payroll/statutory-rates"),
  createStatutoryRate: (data: any) => request("/payroll/statutory-rates", { method: "POST", body: JSON.stringify(data) }),
  getEmployeeSalaryStructures: (employeeId: string) => request(`/payroll/salary-structures/${employeeId}`),
  createSalaryStructure: (data: any) => request("/payroll/salary-structures", { method: "POST", body: JSON.stringify(data) }),
  requestSalaryStructureApproval: (id: string) => request(`/payroll/salary-structures/${id}/request-approval`, { method: "POST" }),

  activateTaxTable: (id: string) => request(`/payroll/tax-tables/${id}/activate`, { method: "POST" }),
  activateStatutoryRate: (id: string) => request(`/payroll/statutory-rates/${id}/activate`, { method: "POST" }),
  listPayrollRuns: () => request("/payroll/runs"),
  getPayrollRun: (id: string) => request(`/payroll/runs/${id}`),
  processPayrollPeriod: (periodId: string) => request(`/payroll/periods/${periodId}/process`, { method: "POST" }),
  requestPayrollRunApproval: (id: string) => request(`/payroll/runs/${id}/request-approval`, { method: "POST" }),
  markPayrollRunPaid: (id: string) => request(`/payroll/runs/${id}/mark-paid`, { method: "POST" }),
  reversePayrollRun: (id: string, reason: string) => request(`/payroll/runs/${id}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }),
  getDisbursementReport: () => request("/payroll/reports/disbursement"),

  listMyPayslips: () => request("/payroll/my-payslips"),
  getMyTaxCertificate: (year?: number) => request(`/payroll/my-tax-certificate${year ? `?year=${year}` : ""}`),
  getMyContributionStatement: (year?: number) => request(`/payroll/my-contribution-statement${year ? `?year=${year}` : ""}`),
  listPayrollGLMappings: () => request("/payroll/gl-mappings"),
  setPayrollGLMapping: (purpose: string, glAccountId: string) => request("/payroll/gl-mappings", { method: "POST", body: JSON.stringify({ purpose, glAccountId }) }),
  getPayrollRunReconciliation: (id: string) => request(`/payroll/runs/${id}/reconciliation`),
  getPayrollReportSummary: () => request("/payroll/reports/summary"),
  getPayrollByDepartment: () => request("/payroll/reports/by-department"),
  getPayrollByBranch: () => request("/payroll/reports/by-branch"),
  getPayrollTrends: (months?: number) => request(`/payroll/reports/trends${months ? `?months=${months}` : ""}`),

  listAssetCategories: () => request("/assets/categories"),
  createAssetCategory: (data: any) => request("/assets/categories", { method: "POST", body: JSON.stringify(data) }),
  listAssets: (status?: string) => request(`/assets/assets${status ? `?status=${status}` : ""}`),
  getAsset: (id: string) => request(`/assets/assets/${id}`),
  createAsset: (data: any) => request("/assets/assets", { method: "POST", body: JSON.stringify(data) }),
  lookupAssetByCode: (code: string) => request(`/assets/assets/lookup?code=${encodeURIComponent(code)}`),
  createAssetAllocation: (data: any) => request("/assets/allocations", { method: "POST", body: JSON.stringify(data) }),
  returnAssetAllocation: (id: string, returnCondition: string) => request(`/assets/allocations/${id}/return`, { method: "POST", body: JSON.stringify({ returnCondition }) }),
  createAssetTransfer: (data: any) => request("/assets/transfers", { method: "POST", body: JSON.stringify(data) }),
  listAssetTransfers: () => request("/assets/transfers"),
  createMaintenanceSchedule: (data: any) => request("/assets/maintenance-schedules", { method: "POST", body: JSON.stringify(data) }),
  createMaintenanceRecord: (data: any) => request("/assets/maintenance-records", { method: "POST", body: JSON.stringify(data) }),
  processAssetDepreciation: (assetId: string, periodLabel: string) => request(`/assets/assets/${assetId}/process-depreciation`, { method: "POST", body: JSON.stringify({ periodLabel }) }),
  createAssetDisposal: (data: any) => request("/assets/disposals", { method: "POST", body: JSON.stringify(data) }),
  listAssetDisposals: () => request("/assets/disposals"),
  createAssetVerification: (data: any) => request("/assets/verifications", { method: "POST", body: JSON.stringify(data) }),
  listAssetGLMappings: () => request("/assets/gl-mappings"),
  setAssetGLMapping: (purpose: string, glAccountId: string) => request("/assets/gl-mappings", { method: "POST", body: JSON.stringify({ purpose, glAccountId }) }),
  getAssetRegisterReport: () => request("/assets/reports/register"),
  getAssetValuationReport: () => request("/assets/reports/valuation"),
  getAssetLifecycleReport: () => request("/assets/reports/lifecycle"),
  getOverdueMaintenanceReport: () => request("/assets/reports/overdue-maintenance"),
  getAssetsByBranchReport: () => request("/assets/reports/by-branch"),

  searchCustomers: (params: { q?: string; branchId?: string; status?: string; kycStatus?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as any).toString();
    return request(`/customers/search?${qs}`);
  },
  lookupCustomerByCode: (code: string) => request(`/customers/search/by-code?code=${encodeURIComponent(code)}`),
  createSavedSearch: (name: string, criteria: any) => request("/customers/saved-searches", { method: "POST", body: JSON.stringify({ name, criteria }) }),
  listSavedSearches: () => request("/customers/saved-searches"),
  recomputeCustomerRiskScore: (id: string) => request(`/customers/${id}/recompute-risk-score`, { method: "POST" }),
  captureCustomerConsent: (data: any) => request("/customers/consents", { method: "POST", body: JSON.stringify(data) }),
  listCustomerConsents: (customerId: string) => request(`/customers/${customerId}/consents`),
  withdrawCustomerConsent: (id: string) => request(`/customers/consents/${id}/withdraw`, { method: "POST" }),
  detectDuplicateCustomers: () => request("/customers/duplicates/detect"),
  requestCustomerMerge: (primaryCustomerId: string, mergedCustomerId: string) => request("/customers/merge-requests", { method: "POST", body: JSON.stringify({ primaryCustomerId, mergedCustomerId }) }),
  listCustomerMergeRequests: () => request("/customers/merge-requests"),
  rollbackCustomerMerge: (id: string, reason: string) => request(`/customers/merge-requests/${id}/rollback`, { method: "POST", body: JSON.stringify({ reason }) }),

  downloadMyPayslip: async (entryId: string) => {
    const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
    const res = await fetch(`${API_BASE}/payroll/my-payslips/${entryId}/download`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Could not download payslip"); }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `payslip-${entryId}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  },
  downloadPayrollBankFile: async (runId: string) => {
    const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
    const res = await fetch(`${API_BASE}/payroll/runs/${runId}/bank-file`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Could not download bank file"); }
    const missing = res.headers.get("X-Missing-Bank-Details");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `payroll-bank-file-${runId}.csv`; a.click();
    window.URL.revokeObjectURL(url);
    return missing;
  },

  listFiscalYears: () => request("/general-ledger/fiscal-years"),
  createFiscalYear: (data: any) => request("/general-ledger/fiscal-years", { method: "POST", body: JSON.stringify(data) }),
  createFinancialPeriod: (data: any) => request("/general-ledger/financial-periods", { method: "POST", body: JSON.stringify(data) }),
  closeFinancialPeriod: (id: string) => request(`/general-ledger/financial-periods/${id}/close`, { method: "POST" }),
  requestPeriodReopen: (id: string, reason: string) => request(`/general-ledger/financial-periods/${id}/request-reopen`, { method: "POST", body: JSON.stringify({ reason }) }),
  lockFinancialPeriod: (id: string) => request(`/general-ledger/financial-periods/${id}/lock`, { method: "POST" }),

  listSavingsAccounts: () => request("/savings"),
  getSavingsAccount: (id: string) => request(`/savings/${id}`),
  addSavingsHolder: (id: string, data: { customerId: string; role: string }) => request(`/savings/${id}/holders`, { method: "POST", body: JSON.stringify(data) }),
  removeSavingsHolder: (id: string, holderId: string) => request(`/savings/${id}/holders/${holderId}`, { method: "DELETE" }),
  openSavingsAccount: (data: { customerId: string; productVersionId: string }) =>
    request("/savings", { method: "POST", body: JSON.stringify(data) }),
  depositSavings: (id: string, amount: number) =>
    request(`/savings/${id}/deposit`, { method: "POST", body: JSON.stringify({ amount }) }),
  withdrawSavings: (id: string, amount: number) =>
    request(`/savings/${id}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) }),
  closeSavingsAccount: (id: string) => request(`/savings/${id}/close`, { method: "POST" }),
  reactivateSavingsAccount: (id: string) => request(`/savings/${id}/reactivate`, { method: "POST" }),

  listAuditLog: (filters?: { userId?: string; action?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.userId) params.set("userId", filters.userId);
    if (filters?.action) params.set("action", filters.action);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    const qs = params.toString();
    return request(`/audit-log${qs ? `?${qs}` : ""}`);
  },

  listProducts: (type?: string) => request(`/products${type ? `?type=${type}` : ""}`),
  getProduct: (id: string) => request(`/products/${id}`),
  createProduct: (data: any) => request("/products", { method: "POST", body: JSON.stringify(data) }),
  addProductVersion: (id: string, data: any) => request(`/products/${id}/versions`, { method: "POST", body: JSON.stringify(data) }),
  listTiers: (productId: string) => request(`/products/${productId}/tiers`),
  addTier: (productId: string, data: { minBalance: number; maxBalance?: number; interestRate: number }) => request(`/products/${productId}/tiers`, { method: "POST", body: JSON.stringify(data) }),
  deleteTier: (productId: string, tierId: string) => request(`/products/${productId}/tiers/${tierId}`, { method: "DELETE" }),

  accrueInterest: (accountId: string, date?: string) => request(`/savings-interest/${accountId}/accrue`, { method: "POST", body: JSON.stringify({ date }) }),
  accrueInterestAll: (date?: string) => request(`/savings-interest/accrue-all`, { method: "POST", body: JSON.stringify({ date }) }),
  postInterest: (accountId: string) => request(`/savings-interest/${accountId}/post`, { method: "POST" }),
  postInterestAll: () => request(`/savings-interest/post-all`, { method: "POST" }),
  reverseInterestPosting: (postingId: string, reason: string) => request(`/savings-interest/postings/${postingId}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }),
  suspendInterest: (accountId: string, reason?: string) => request(`/savings-interest/${accountId}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
  resumeInterest: (accountId: string) => request(`/savings-interest/${accountId}/resume`, { method: "POST" }),
  getInterestAccruals: (accountId: string) => request(`/savings-interest/${accountId}/accruals`),
  getInterestReport: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request(`/savings-interest/report${qs ? `?${qs}` : ""}`);
  },
  activateProduct: (id: string) => request(`/products/${id}/activate`, { method: "POST" }),
  withdrawProduct: (id: string) => request(`/products/${id}/withdraw`, { method: "POST" }),
  archiveProduct: (id: string) => request(`/products/${id}/archive`, { method: "POST" }),

  getReportsOverview: (months = 6) => request(`/reports/overview?months=${months}`),
  getLoanReport: (from?: string, to?: string) =>
    request(`/reports/loans${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
  getSavingsReport: (from?: string, to?: string) =>
    request(`/reports/savings${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
  getCustomerReport: (from?: string, to?: string) =>
    request(`/reports/customers${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),

  downloadCustomerImportTemplate: () => downloadFile("/migration/customers/template", "nexus-customer-import-template.xlsx"),
  dryRunCustomerImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/customers/dry-run", fd);
  },
  commitCustomerImport: (file: File, resolutions: Record<string, "skip" | "update">) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("resolutions", JSON.stringify(resolutions));
    return requestFormData("/migration/customers/commit", fd);
  },
  listImportBatches: () => request("/migration/batches"),
  undoImportBatch: (id: string) => request(`/migration/batches/${id}/undo`, { method: "POST" }),

  downloadSavingsImportTemplate: () => downloadFile("/migration/savings/template", "nexus-savings-import-template.xlsx"),
  dryRunSavingsImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/savings/dry-run", fd);
  },
  commitSavingsImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/savings/commit", fd);
  },

  downloadLoanOpeningBalanceTemplate: () => downloadFile("/migration/loans/template/opening-balance", "nexus-loan-opening-balance-template.xlsx"),
  downloadLoanFullHistoryTemplate: () => downloadFile("/migration/loans/template/full-history", "nexus-loan-full-history-template.xlsx"),
  dryRunLoanOpeningBalance: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/loans/opening-balance/dry-run", fd);
  },
  commitLoanOpeningBalance: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/loans/opening-balance/commit", fd);
  },
  dryRunLoanFullHistory: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/loans/full-history/dry-run", fd);
  },
  commitLoanFullHistory: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestFormData("/migration/loans/full-history/commit", fd);
  },

  listBusinessRules: () => request("/business-rules"),
  getBusinessRule: (id: string) => request(`/business-rules/${id}`),
  createBusinessRule: (data: any) => request("/business-rules", { method: "POST", body: JSON.stringify(data) }),
  updateBusinessRule: (id: string, data: any) => request(`/business-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  requestRuleActivation: (id: string) => request(`/business-rules/${id}/request-activation`, { method: "POST" }),
  retireBusinessRule: (id: string) => request(`/business-rules/${id}/retire`, { method: "POST" }),
};

// NOTE: sessionStorage is used here (client-only, in-memory-per-tab) rather
// than any persistent browser storage mechanism. In production this should
// move to an httpOnly cookie set by the API.
export function persistSession(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("nexus_access_token", accessToken);
  sessionStorage.setItem("nexus_refresh_token", refreshToken);
}
