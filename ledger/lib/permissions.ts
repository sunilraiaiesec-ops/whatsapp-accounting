// Central role → permission matrix for BantooBooks.
//
// Extends the pre-existing 3-role convention (OWNER/ADMIN/STAFF, gated ad hoc
// at each call site via `ctx.role === "OWNER"` or lib/migration/wizard.ts's
// `isAdminRole`) to 8 tiers, WITHOUT inventing a parallel convention: this is
// the one place that decides what a role can do, and every new/updated check
// in the app should call `can()`/`hasPermission()` rather than compare
// `role` strings directly.
//
// Role migration (see the accompanying Prisma migration for the SQL):
//   OWNER -> OWNER   (unchanged)
//   ADMIN -> ADMIN   (unchanged)
//   STAFF -> ACCOUNTANT
// STAFF was the app's only non-admin role, with no restrictions beyond "not
// an admin" (isAdminRole("STAFF") === false, and every document/inventory
// creation action was open to any authenticated member regardless of role).
// ACCOUNTANT is the closest match under the new matrix: it keeps full
// create/edit/approve/reject/view/export capability (STAFF users lose no
// capability they had), while correctly excluding the genuinely-new
// Owner/Admin-only capabilities (invite users, manage billing, manage
// settings) that STAFF never had access to either. Every existing STAFF
// membership therefore keeps 100% of its previous effective behavior.
//
// isAdminRole (lib/migration/wizard.ts) is intentionally left untouched: it
// only ever compared against "OWNER"/"ADMIN", both of which keep their exact
// name and meaning here, so it continues to behave identically for every
// role — old and new.

export const ROLES = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "MANAGER",
  "CASHIER",
  "WAREHOUSE_STAFF",
  "SALESPERSON",
  "VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Human-readable labels for the Settings/Team UI. Kept here (not in
// messages/*.json) because role names are proper nouns for this domain and
// don't need translation the way UI copy does — same pattern as the
// underlying Prisma enum values themselves.
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  WAREHOUSE_STAFF: "Warehouse Staff",
  SALESPERSON: "Salesperson",
  VIEWER: "Viewer",
};

export type PermissionKey =
  | "createTransactions"
  | "approveTransactions"
  | "rejectTransactions"
  | "editTransactions"
  | "deleteTransactions"
  | "inviteUsers"
  | "manageBilling"
  | "manageSettings"
  | "viewReports"
  | "exportData"
  | "manageFixedAssets";

export const PERMISSION_KEYS: PermissionKey[] = [
  "createTransactions",
  "approveTransactions",
  "rejectTransactions",
  "editTransactions",
  "deleteTransactions",
  "inviteUsers",
  "manageBilling",
  "manageSettings",
  "viewReports",
  "exportData",
  "manageFixedAssets",
];

type PermissionRow = Record<PermissionKey, boolean>;

function all(value: boolean): PermissionRow {
  return {
    createTransactions: value,
    approveTransactions: value,
    rejectTransactions: value,
    editTransactions: value,
    deleteTransactions: value,
    inviteUsers: value,
    manageBilling: value,
    manageSettings: value,
    viewReports: value,
    exportData: value,
    manageFixedAssets: value,
  };
}

// The permission matrix. Owner = everything true, per spec. Design notes for
// every other row:
//
// - ADMIN: everything an Owner can do EXCEPT manage billing — billing/
//   subscription changes are reserved for the account owner (a common SaaS
//   convention; see the report's plan-tier note on how this should
//   eventually interact with lib/billing/plans.ts).
// - ACCOUNTANT: full transaction lifecycle (create/approve/reject/edit/
//   delete) and reporting, matching "posts directly, can approve others"
//   from §11 — but no user/billing/settings management.
// - MANAGER: can create and edit transactions but NOT approve/reject other
//   people's drafts (that's reserved for Owner/Admin/Accountant per §11) and
//   not delete/void (a manager correcting their own mistake edits it; voiding
//   is left to a more senior role). Can view/export reports.
// - CASHIER / WAREHOUSE_STAFF / SALESPERSON: front-line roles that can only
//   create transactions (of the kind relevant to their job — enforced by the
//   UI/actions they're given access to, not by this matrix) — no edit,
//   delete, approve, reject, reporting, or admin capability. Under the
//   approval workflow (§11) everything they create is routed to a
//   PendingTransaction when the org toggle is on.
// - VIEWER: read-only — can view reports but nothing else, including export
//   (export is a step up from view, reserved for roles that also touch the
//   books).
//
// manageFixedAssets (lib/fixed-assets/*): create/edit/dispose an asset and
// post depreciation. Deliberately its own key rather than reusing
// createTransactions — that key is also true for CASHIER/WAREHOUSE_STAFF/
// SALESPERSON, which the Fixed Assets spec explicitly excludes. True for
// OWNER/ADMIN/ACCOUNTANT/MANAGER only. Viewing the asset register/reports
// uses the existing viewReports key (already OWNER/ADMIN/ACCOUNTANT/MANAGER/
// VIEWER, already excluding the three front-line roles) — no new key needed
// for that half.
const MATRIX: Record<Role, PermissionRow> = {
  OWNER: all(true),
  ADMIN: { ...all(true), manageBilling: false },
  ACCOUNTANT: {
    createTransactions: true,
    approveTransactions: true,
    rejectTransactions: true,
    editTransactions: true,
    deleteTransactions: true,
    inviteUsers: false,
    manageBilling: false,
    manageSettings: false,
    viewReports: true,
    exportData: true,
    manageFixedAssets: true,
  },
  MANAGER: {
    createTransactions: true,
    approveTransactions: false,
    rejectTransactions: false,
    editTransactions: true,
    deleteTransactions: false,
    inviteUsers: false,
    manageBilling: false,
    manageSettings: false,
    viewReports: true,
    exportData: true,
    manageFixedAssets: true,
  },
  CASHIER: {
    ...all(false),
    createTransactions: true,
  },
  WAREHOUSE_STAFF: {
    ...all(false),
    createTransactions: true,
  },
  SALESPERSON: {
    ...all(false),
    createTransactions: true,
  },
  VIEWER: {
    ...all(false),
    viewReports: true,
  },
};

// The single source of truth every role check should go through. Unknown
// role strings (e.g. stale data, a future role not yet added here) fail
// closed — no permission is ever granted by default.
export function can(role: string, permission: PermissionKey): boolean {
  if (!isRole(role)) return false;
  return MATRIX[role][permission];
}

// Same as `can`, but takes a membership-shaped object — convenient at call
// sites that already have `{ role }` (e.g. CurrentContext) on hand.
export function hasPermission(
  membership: { role: string },
  permission: PermissionKey,
): boolean {
  return can(membership.role, permission);
}

// The full matrix, for rendering a permissions table in the UI or tests.
export function permissionMatrix(): Record<Role, PermissionRow> {
  return MATRIX;
}

// True for OWNER and ADMIN — mirrors lib/migration/wizard.ts's isAdminRole
// exactly (same two roles, same meaning) so both can be used interchangeably.
// Exported here too so new code has one obvious place to import it from;
// wizard.ts's own copy is left in place unchanged to avoid touching its
// already-passing test suite.
export function isAdminRole(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

// True for OWNER only. Some actions (factory reset) are intentionally
// stricter than the general permission matrix and reserved for the account
// owner alone — this predicate documents that as a deliberate, named
// exception rather than a bare string comparison at the call site.
export function isOwnerRole(role: string): boolean {
  return role === "OWNER";
}
