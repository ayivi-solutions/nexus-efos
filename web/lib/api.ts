const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100";

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

async function request(path: string, options: RequestInit = {}, _retried = false): Promise<any> {
  const accessToken = typeof window !== "undefined" ? sessionStorage.getItem("nexus_access_token") : null;
  const res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && !_retried && typeof window !== "undefined" && path !== "/auth/refresh") {
    const refreshToken = sessionStorage.getItem("nexus_refresh_token");
    if (refreshToken) {
      try {
        const refreshRes = await rawFetch("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }, null);
        if (refreshRes.ok) {
          const { accessToken: newAccessToken } = await refreshRes.json();
          sessionStorage.setItem("nexus_access_token", newAccessToken);
          return request(path, options, true); // retry once, silently, with the new token
        }
      } catch {
        // fall through to session-expired handling below
      }
    }
    // Refresh token missing, invalid, or itself expired — the session is genuinely over.
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

  inviteStaff: (data: { fullName: string; email: string; roleId: string; branchId?: string }) =>
    request("/institutions/onboarding/staff", { method: "POST", body: JSON.stringify(data) }),

  goLive: () => request("/institutions/onboarding/go-live", { method: "POST" }),

  listUsers: () => request("/institutions/users"),

  listBranches: () => request("/institutions/branches"),
  createBranch: (data: { name: string; code: string; region?: string }) =>
    request("/institutions/branches", { method: "POST", body: JSON.stringify(data) }),

  listCustomers: () => request("/customers"),
  getCustomer: (id: string) => request(`/customers/${id}`),

  listEmployees: () => request("/employees"),
  createEmployee: (data: { fullName: string; email: string; branchId?: string }) =>
    request("/employees", { method: "POST", body: JSON.stringify(data) }),
  grantAccess: (employeeId: string, data: { roleId: string; branchId?: string }) =>
    request(`/employees/${employeeId}/grant-access`, { method: "POST", body: JSON.stringify(data) }),

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
  recordRepayment: (id: string, amount: number) => request(`/loans/${id}/repayments`, { method: "POST", body: JSON.stringify({ amount }) }),
  recordRepayment: (id: string, amount: number) => request(`/loans/${id}/repayments`, { method: "POST", body: JSON.stringify({ amount }) }),

  listSavingsAccounts: () => request("/savings"),
  openSavingsAccount: (data: { customerId: string }) =>
    request("/savings", { method: "POST", body: JSON.stringify(data) }),
  depositSavings: (id: string, amount: number) =>
    request(`/savings/${id}/deposit`, { method: "POST", body: JSON.stringify({ amount }) }),
  withdrawSavings: (id: string, amount: number) =>
    request(`/savings/${id}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) }),

  listAuditLog: () => request("/audit-log"),

  getReportsOverview: (months = 6) => request(`/reports/overview?months=${months}`),
  getLoanReport: (from?: string, to?: string) =>
    request(`/reports/loans${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
  getSavingsReport: (from?: string, to?: string) =>
    request(`/reports/savings${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
  getCustomerReport: (from?: string, to?: string) =>
    request(`/reports/customers${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
};

// NOTE: sessionStorage is used here (client-only, in-memory-per-tab) rather
// than any persistent browser storage mechanism. In production this should
// move to an httpOnly cookie set by the API.
export function persistSession(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("nexus_access_token", accessToken);
  sessionStorage.setItem("nexus_refresh_token", refreshToken);
}
