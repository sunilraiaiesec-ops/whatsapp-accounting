import { describe, expect, it } from "vitest";

import {
  can,
  hasPermission,
  isAdminRole,
  isOwnerRole,
  isRole,
  PERMISSION_KEYS,
  permissionMatrix,
  ROLE_LABELS,
  ROLES,
} from "@/lib/permissions";

describe("permissions — role/permission matrix", () => {
  it("Owner has every permission set to true", () => {
    for (const key of PERMISSION_KEYS) {
      expect(can("OWNER", key)).toBe(true);
    }
  });

  it("Admin has every permission except manageBilling", () => {
    for (const key of PERMISSION_KEYS) {
      if (key === "manageBilling") {
        expect(can("ADMIN", key)).toBe(false);
      } else {
        expect(can("ADMIN", key)).toBe(true);
      }
    }
  });

  it("Accountant can run the full transaction lifecycle but not manage users/billing/settings", () => {
    expect(can("ACCOUNTANT", "createTransactions")).toBe(true);
    expect(can("ACCOUNTANT", "approveTransactions")).toBe(true);
    expect(can("ACCOUNTANT", "rejectTransactions")).toBe(true);
    expect(can("ACCOUNTANT", "editTransactions")).toBe(true);
    expect(can("ACCOUNTANT", "deleteTransactions")).toBe(true);
    expect(can("ACCOUNTANT", "viewReports")).toBe(true);
    expect(can("ACCOUNTANT", "exportData")).toBe(true);
    expect(can("ACCOUNTANT", "inviteUsers")).toBe(false);
    expect(can("ACCOUNTANT", "manageBilling")).toBe(false);
    expect(can("ACCOUNTANT", "manageSettings")).toBe(false);
  });

  it("Manager can create/edit and view/export reports but cannot approve, reject, or delete", () => {
    expect(can("MANAGER", "createTransactions")).toBe(true);
    expect(can("MANAGER", "editTransactions")).toBe(true);
    expect(can("MANAGER", "viewReports")).toBe(true);
    expect(can("MANAGER", "exportData")).toBe(true);
    expect(can("MANAGER", "approveTransactions")).toBe(false);
    expect(can("MANAGER", "rejectTransactions")).toBe(false);
    expect(can("MANAGER", "deleteTransactions")).toBe(false);
  });

  it.each(["CASHIER", "WAREHOUSE_STAFF", "SALESPERSON"] as const)(
    "%s can only create transactions — nothing else",
    (role) => {
      expect(can(role, "createTransactions")).toBe(true);
      for (const key of PERMISSION_KEYS) {
        if (key === "createTransactions") continue;
        expect(can(role, key)).toBe(false);
      }
    },
  );

  it("Viewer can only view reports", () => {
    expect(can("VIEWER", "viewReports")).toBe(true);
    for (const key of PERMISSION_KEYS) {
      if (key === "viewReports") continue;
      expect(can("VIEWER", key)).toBe(false);
    }
  });

  it.each(["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER"] as const)(
    "%s can manage fixed assets",
    (role) => {
      expect(can(role, "manageFixedAssets")).toBe(true);
    },
  );

  it.each(["CASHIER", "WAREHOUSE_STAFF", "SALESPERSON", "VIEWER"] as const)(
    "%s cannot manage fixed assets",
    (role) => {
      expect(can(role, "manageFixedAssets")).toBe(false);
    },
  );

  it("fails closed for an unknown/invalid role", () => {
    expect(can("NOT_A_REAL_ROLE", "viewReports")).toBe(false);
    expect(can("staff", "createTransactions")).toBe(false); // old lowercase/legacy value
  });

  it("hasPermission delegates to can() using membership.role", () => {
    expect(hasPermission({ role: "OWNER" }, "manageBilling")).toBe(true);
    expect(hasPermission({ role: "CASHIER" }, "manageBilling")).toBe(false);
  });

  it("isRole / ROLE_LABELS cover exactly the 8 documented tiers", () => {
    expect(ROLES).toHaveLength(8);
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
    expect(isRole("STAFF")).toBe(false); // old pre-migration value is no longer a valid Role
  });

  it("isAdminRole / isOwnerRole preserve the pre-existing OWNER/ADMIN convention", () => {
    expect(isAdminRole("OWNER")).toBe(true);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("ACCOUNTANT")).toBe(false);
    expect(isOwnerRole("OWNER")).toBe(true);
    expect(isOwnerRole("ADMIN")).toBe(false);
  });

  it("permissionMatrix() exposes a row for every role with every key defined", () => {
    const matrix = permissionMatrix();
    for (const role of ROLES) {
      for (const key of PERMISSION_KEYS) {
        expect(typeof matrix[role][key]).toBe("boolean");
      }
    }
  });
});
