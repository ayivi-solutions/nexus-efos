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
const UNAUTHENTICATED_PATHS = ["/auth/login", "/auth/register-institution", "/auth/accept-invite", "/auth/refresh", "/auth/logout"];

async function request(path: string, options: RequestInit = {}, _retried = false): Promise<any> {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
  const res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && !_retried && typeof window !== "undefined" && !UNAUTHENTICATED_PATHS.includes(path)) {
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

  login: (data: { email: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

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
  updateRole: (id: string, data: { description?: string; permissionCodes?: string[] }) =>
    request(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  createRole: (data: { name: string; description?: string; category: string; permissionCodes?: string[] }) =>
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
  createCustomer: (data: { fullName: string; phone: string; email?: string; segment: string }) =>
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
};

// NOTE: sessionStorage is used here (client-only, in-memory-per-tab) rather
// than any persistent browser storage mechanism. In production this should
// move to an httpOnly cookie set by the API.
export function persistSession(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("nexus_access_token", accessToken);
  sessionStorage.setItem("nexus_refresh_token", refreshToken);
}
