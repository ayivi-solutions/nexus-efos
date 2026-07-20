const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100";

async function request(path: string, options: RequestInit = {}) {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

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
  }) => request("/auth/register-institution", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

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

  inviteStaff: (data: { fullName: string; email: string; roleId: string; branchId?: string }) =>
    request("/institutions/onboarding/staff", { method: "POST", body: JSON.stringify(data) }),

  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),

  listUsers: () => request("/institutions/users"),

  listBranches: () => request("/institutions/branches"),
  createBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/branches", { method: "POST", body: JSON.stringify(data) }),

  listCustomers: () => request("/customers"),
  createCustomer: (data: { fullName: string; phone: string; email?: string; segment: string }) =>
    request("/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomerStage: (id: string, lifecycleStage: string) =>
    request(`/customers/${id}/stage`, { method: "PATCH", body: JSON.stringify({ lifecycleStage }) }),
  updateCustomerKyc: (id: string, kycStatus: string) =>
    request(`/customers/${id}/kyc`, { method: "PATCH", body: JSON.stringify({ kycStatus }) }),

  listLoans: () => request("/loans"),
  createLoan: (data: { customerId: string; principal: number; interestRate: number; termMonths: number }) =>
    request("/loans", { method: "POST", body: JSON.stringify(data) }),
  approveLoan: (id: string) => request(`/loans/${id}/approve`, { method: "POST" }),
  rejectLoan: (id: string) => request(`/loans/${id}/reject`, { method: "POST" }),
  disburseLoan: (id: string) => request(`/loans/${id}/disburse`, { method: "POST" }),

  listSavingsAccounts: () => request("/savings"),
  openSavingsAccount: (data: { customerId: string }) =>
    request("/savings", { method: "POST", body: JSON.stringify(data) }),
  depositSavings: (id: string, amount: number) =>
    request(`/savings/${id}/deposit`, { method: "POST", body: JSON.stringify({ amount }) }),
  withdrawSavings: (id: string, amount: number) =>
    request(`/savings/${id}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) }),

  listAuditLog: () => request("/audit-log"),

  logout: () => {
    const refreshToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_refresh_token") : null;
    return request("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => {});
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
