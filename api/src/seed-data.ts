// Permission codes follow "<resource>.<action>". Categories and actions are
// taken directly from doc §39.6 (Data / Transaction / Administrative /
// Reporting / Integration) and §38.9 (View / Create / Update / Delete /
// Approve / Reject / Export / Configure / Administer / Audit).

export interface PermissionDef {
  code: string;
  category: "DATA" | "TRANSACTION" | "ADMINISTRATIVE" | "REPORTING" | "INTEGRATION";
  action: "VIEW" | "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "EXPORT" | "CONFIGURE" | "ADMINISTER" | "AUDIT";
  resource: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Data
  { code: "customers.view", category: "DATA", action: "VIEW", resource: "customers", description: "View customer records" },
  { code: "customers.create", category: "DATA", action: "CREATE", resource: "customers", description: "Create customer records" },
  { code: "customers.update", category: "DATA", action: "UPDATE", resource: "customers", description: "Update customer records" },
  { code: "customers.delete", category: "DATA", action: "DELETE", resource: "customers", description: "Delete customer records" },

  // Transaction
  { code: "loans.initiate", category: "TRANSACTION", action: "CREATE", resource: "loans", description: "Initiate a loan" },
  { code: "loans.approve", category: "TRANSACTION", action: "APPROVE", resource: "loans", description: "Approve a loan disbursement" },
  { code: "loans.reject", category: "TRANSACTION", action: "REJECT", resource: "loans", description: "Reject a loan application" },
  { code: "savings.initiate", category: "TRANSACTION", action: "CREATE", resource: "savings", description: "Initiate a savings transaction" },
  { code: "savings.approve", category: "TRANSACTION", action: "APPROVE", resource: "savings", description: "Approve a savings transaction" },
  { code: "collections.record", category: "TRANSACTION", action: "CREATE", resource: "collections", description: "Record a field collection" },

  // Administrative
  { code: "users.administer", category: "ADMINISTRATIVE", action: "ADMINISTER", resource: "users", description: "Manage users" },
  { code: "roles.assign", category: "ADMINISTRATIVE", action: "CONFIGURE", resource: "roles", description: "Assign roles to users" },
  { code: "roles.configure", category: "ADMINISTRATIVE", action: "CONFIGURE", resource: "roles", description: "Configure roles and permission sets" },
  { code: "branches.administer", category: "ADMINISTRATIVE", action: "ADMINISTER", resource: "branches", description: "Manage branches" },
  { code: "institution.configure", category: "ADMINISTRATIVE", action: "CONFIGURE", resource: "institution", description: "Configure institution settings" },

  // Reporting
  { code: "reports.view", category: "REPORTING", action: "VIEW", resource: "reports", description: "View reports" },
  { code: "reports.export", category: "REPORTING", action: "EXPORT", resource: "reports", description: "Export reports" },
  { code: "reports.regulatory.approve", category: "REPORTING", action: "APPROVE", resource: "reports", description: "Approve regulatory submissions" },
  { code: "audit.view", category: "REPORTING", action: "AUDIT", resource: "audit_logs", description: "View audit trail" },

  // Integration
  { code: "api.access", category: "INTEGRATION", action: "VIEW", resource: "api", description: "Access platform APIs" },
  { code: "api.keys.manage", category: "INTEGRATION", action: "ADMINISTER", resource: "api", description: "Create/revoke API keys" },

  // Data Migration — deliberately its own permission, not bundled into
  // institution.configure. Bulk-committing hundreds of financial records
  // at once carries real audit/regulatory stakes higher than ordinary
  // institution configuration; §35.4's "Merge operations require
  // authorised approval" spirit applied to bulk import generally.
  { code: "data.migrate", category: "ADMINISTRATIVE", action: "ADMINISTER", resource: "data", description: "Run bulk data migration imports" },
];

export interface RoleTemplate {
  name: string;
  category: "EXECUTIVE" | "OPERATIONAL" | "GOVERNANCE" | "TECHNICAL" | "CUSTOMER";
  description: string;
  permissionCodes: string[];
}

// doc §38.7 — Core Enterprise Roles (subset seeded at institution creation;
// the full catalogue in the doc is much larger and can be extended per
// institution via roles.configure).
export const SYSTEM_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: "Chief Executive Officer",
    category: "EXECUTIVE",
    description: "Full institutional authority; strategic oversight (doc §38.7 Executive Roles)",
    permissionCodes: PERMISSION_CATALOG.map((p) => p.code), // CEO gets everything at seed time
  },
  {
    name: "Branch Manager",
    category: "OPERATIONAL",
    description: "Operational oversight, approvals, resource allocation (doc §38.8)",
    permissionCodes: [
      "customers.view", "customers.create", "customers.update",
      "loans.approve", "loans.reject", "savings.approve",
      "reports.view", "reports.export",
    ],
  },
  {
    name: "Loan Officer",
    category: "OPERATIONAL",
    description: "Loan origination and customer management",
    permissionCodes: ["customers.view", "customers.create", "loans.initiate", "reports.view"],
  },
  {
    name: "Credit Analyst",
    category: "OPERATIONAL",
    description: "Credit risk assessment supporting loan decisions, kept separate from origination and approval per segregation of duties (doc §14.5 Employees, §38.11)",
    permissionCodes: ["customers.view", "reports.view"],
  },
  {
    name: "Credit Manager",
    category: "OPERATIONAL",
    description: "Credit risk oversight and loan approval authority (doc §69 — loan approval involves credit officers, risk managers and executive approvers)",
    permissionCodes: ["customers.view", "loans.initiate", "loans.approve", "loans.reject", "reports.view", "reports.export"],
  },
  {
    name: "Field Collector",
    category: "OPERATIONAL",
    description: "Customer collections, receipt generation, route management (doc §38.8)",
    permissionCodes: ["customers.view", "collections.record"],
  },
  {
    name: "Compliance Officer",
    category: "GOVERNANCE",
    description: "Compliance monitoring, regulatory reporting, risk assessment (doc §38.8)",
    permissionCodes: ["reports.view", "reports.export", "reports.regulatory.approve", "audit.view"],
  },
  {
    name: "System Administrator",
    category: "TECHNICAL",
    description: "User, role and integration administration (doc §38.7 Technical Roles)",
    permissionCodes: ["users.administer", "roles.assign", "roles.configure", "branches.administer", "institution.configure", "api.keys.manage", "audit.view", "data.migrate"],
  },
  {
    name: "Individual Customer",
    category: "CUSTOMER",
    description: "External customer with self-service access (doc §38.7 Customer Roles)",
    permissionCodes: [],
  },
];
