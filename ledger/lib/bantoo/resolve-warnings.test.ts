import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractedAction } from "@/lib/ai/actions";
import type { CurrentContext } from "@/lib/auth/current";

const listInventoryItems = vi.fn();
const loadEntityCandidates = vi.fn();
const bankAndCashAccounts = vi.fn();
const getCommandPatternSuggestions = vi.fn();

vi.mock("@/lib/inventory", () => ({
  listInventoryItems: (...args: unknown[]) => listInventoryItems(...args),
}));

vi.mock("@/lib/bantoo/entities", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bantoo/entities")>();
  return {
    ...actual,
    loadEntityCandidates: (...args: unknown[]) => loadEntityCandidates(...args),
  };
});

vi.mock("@/lib/accounts", () => ({
  bankAndCashAccounts: (...args: unknown[]) => bankAndCashAccounts(...args),
  paymentCounterpartAccounts: vi.fn().mockResolvedValue([]),
  receiptCounterpartAccounts: vi.fn().mockResolvedValue([]),
  receivableAccount: vi.fn(),
}));

vi.mock("@/lib/command-patterns", () => ({
  getCommandPatternSuggestions: (...args: unknown[]) => getCommandPatternSuggestions(...args),
  dueDateFromTerms: vi.fn(),
}));

const { resolveExtraction } = await import("@/lib/bantoo/resolve");

const ctx: CurrentContext = {
  orgId: "org_A",
  userId: "user_1",
  baseCurrency: "XAF",
  userName: "Test User",
  userEmail: "test@example.com",
  orgName: "Test Org",
  role: "owner",
  emailVerified: true,
  approvalWorkflowEnabled: false,
};

beforeEach(() => {
  listInventoryItems.mockReset().mockResolvedValue([]);
  loadEntityCandidates.mockReset().mockResolvedValue([]);
  bankAndCashAccounts.mockReset().mockResolvedValue([]);
  getCommandPatternSuggestions.mockReset().mockResolvedValue({});
});

describe("resolveExtraction warnings (BUG-002)", () => {
  it("returns stable warning codes instead of hardcoded English strings", async () => {
    const action: ExtractedAction = {
      action: "receive_stock",
      product_name: "rice",
      barcode: null,
      sku: null,
      unit: null,
      quantity: null,
      cost_price: null,
      supplier_name: null,
      date: null,
      currency: "XAF",
      confidence: 0.9,
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.warnings.length).toBeGreaterThan(0);
    for (const warning of proposal.warnings) {
      expect(warning).toHaveProperty("code");
      expect(typeof warning.code).toBe("string");
      expect(warning.code.length).toBeGreaterThan(0);
      // Regression guard: warnings must not be raw English prose.
      expect(warning).not.toHaveProperty("text");
      expect(JSON.stringify(warning)).not.toMatch(/Choose the supplier/i);
    }
    expect(proposal.warnings.some((w) => w.code === "chooseSupplier")).toBe(true);
    expect(proposal.warnings.some((w) => w.code === "enterQuantity")).toBe(true);
  });

  it("returns field reason codes from pattern learning, not English prose", async () => {
    getCommandPatternSuggestions.mockResolvedValue({
      supplier: {
        id: "sup_A",
        label: "Supplier A",
        score: 85,
        bucket: "medium",
        count: 5,
        reason: {
          code: "supplierProductHistory",
          params: { name: "Supplier A", count: 5, lookbackMonths: 6 },
        },
      },
    });
    loadEntityCandidates.mockImplementation(async (_ctx, type: string) => {
      if (type === "supplier") {
        return [{ id: "sup_A", label: "Supplier A", text: "Supplier A" }];
      }
      return [];
    });
    listInventoryItems.mockResolvedValue([
      { id: "item_rice", code: "RICE", name: "Rice 50kg", barcode: null, unit: "bag", costPrice: 1000n },
    ]);

    const action: ExtractedAction = {
      action: "receive_stock",
      product_name: "rice",
      barcode: null,
      sku: null,
      unit: "bag",
      quantity: 50,
      cost_price: 12000,
      supplier_name: null,
      date: null,
      currency: "XAF",
      confidence: 0.9,
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.fieldReasons.supplier?.code).toBe("supplierProductHistory");
    expect(proposal.fieldReasons.supplier?.params?.name).toBe("Supplier A");
    expect(proposal.fieldReasons.supplier).not.toHaveProperty("text");
  });

  it("resolves create_customer with high confidence and populated draft (BUG-005)", async () => {
    const action: ExtractedAction = {
      action: "create_customer",
      customer_name: "Golu",
      city: "Ngoundéré",
      phone: null,
      whatsapp: null,
      country: null,
      note: null,
      email: null,
      company_name: null,
      tax_id: null,
      payment_terms_days: null,
      credit_limit: null,
      default_discount: null,
      preferred_language: null,
      preferred_payment_method: null,
      post_action: null,
      unsupported_requests: null,
      currency: "XAF",
      confidence: 0.75,
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.action).toBe("create_customer");
    expect(proposal.lowConfidence).toBe(false);
    expect(proposal.draft.partyName).toBe("Golu");
    expect(proposal.draft.city).toBe("Ngoundéré");
    expect(proposal.partyType).toBe("customer");
    expect(proposal.createParty).toBe(true);
  });
});
