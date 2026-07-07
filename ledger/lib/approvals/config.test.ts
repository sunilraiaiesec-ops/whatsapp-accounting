import { describe, expect, it } from "vitest";

import { MANAGER_APPROVAL_THRESHOLD_MINOR, requiresApproval } from "@/lib/approvals/config";

describe("requiresApproval — §11 approval-required-by-role decisions", () => {
  it("toggle off means nobody needs approval, regardless of role", () => {
    for (const role of ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "CASHIER", "WAREHOUSE_STAFF", "SALESPERSON"]) {
      expect(requiresApproval(role, "expense", 10_000_000n, false)).toBe(false);
    }
  });

  it.each(["OWNER", "ADMIN", "ACCOUNTANT"] as const)(
    "%s always posts directly, even for a huge amount, when the toggle is on",
    (role) => {
      expect(requiresApproval(role, "expense", 999_999_999n, true)).toBe(false);
      expect(requiresApproval(role, "stock_receipt", 999_999_999n, true)).toBe(false);
    },
  );

  it.each(["CASHIER", "WAREHOUSE_STAFF", "SALESPERSON"] as const)(
    "%s is always gated for every transaction type when the toggle is on",
    (role) => {
      for (const type of [
        "expense",
        "purchase_invoice",
        "sales_invoice",
        "payment_received",
        "supplier_payment",
        "inventory_adjustment",
        "stock_receipt",
      ] as const) {
        expect(requiresApproval(role, type, 1n, true)).toBe(true);
      }
    },
  );

  it("Viewer is never gated (createTransactions is false, so requiresApproval short-circuits false)", () => {
    expect(requiresApproval("VIEWER", "expense", 1_000_000n, true)).toBe(false);
  });

  describe("Manager — judgment call: gated types only above the value threshold", () => {
    it("posts directly for a gated type below the threshold", () => {
      const belowThreshold = MANAGER_APPROVAL_THRESHOLD_MINOR - 1n;
      expect(requiresApproval("MANAGER", "expense", belowThreshold, true)).toBe(false);
    });

    it("requires approval for a gated type at/above the threshold", () => {
      expect(requiresApproval("MANAGER", "expense", MANAGER_APPROVAL_THRESHOLD_MINOR, true)).toBe(true);
      expect(requiresApproval("MANAGER", "purchase_invoice", MANAGER_APPROVAL_THRESHOLD_MINOR + 1n, true)).toBe(
        true,
      );
      expect(requiresApproval("MANAGER", "sales_invoice", MANAGER_APPROVAL_THRESHOLD_MINOR, true)).toBe(true);
      expect(requiresApproval("MANAGER", "supplier_payment", MANAGER_APPROVAL_THRESHOLD_MINOR, true)).toBe(true);
    });

    it("always posts directly for the lower-risk types regardless of amount", () => {
      expect(requiresApproval("MANAGER", "payment_received", 999_999_999n, true)).toBe(false);
      expect(requiresApproval("MANAGER", "stock_receipt", 999_999_999n, true)).toBe(false);
      expect(requiresApproval("MANAGER", "inventory_adjustment", 999_999_999n, true)).toBe(false);
    });
  });
});
