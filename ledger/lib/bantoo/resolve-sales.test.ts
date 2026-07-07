import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractedAction } from "@/lib/ai/actions";
import type { CurrentContext } from "@/lib/auth/current";

const listInventoryItems = vi.fn();
const loadEntityCandidates = vi.fn();
const bankAndCashAccounts = vi.fn();
const receiptCounterpartAccounts = vi.fn();
const getCommandPatternSuggestions = vi.fn();
const getPartyContact = vi.fn();

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
  receiptCounterpartAccounts: (...args: unknown[]) => receiptCounterpartAccounts(...args),
  receivableAccount: vi.fn(),
}));

vi.mock("@/lib/command-patterns", () => ({
  getCommandPatternSuggestions: (...args: unknown[]) => getCommandPatternSuggestions(...args),
  dueDateFromTerms: vi.fn(),
}));

vi.mock("@/lib/parties", () => ({
  getPartyContact: (...args: unknown[]) => getPartyContact(...args),
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

const MUSA = { id: "party_musa", label: "Musa Ibrahim", text: "Musa Ibrahim" };

const SALES_ACCOUNT = { id: "acct_sales", code: "4000", name: "Sales", type: "INCOME", subtype: "sales" };
const BANK_ACCOUNT = { id: "acct_bank", code: "1000", name: "Cash", subtype: "cash" };

function baseFields() {
  return { confidence: 0.9, summary: null, currency: "XAF" } as const;
}

beforeEach(() => {
  listInventoryItems.mockReset().mockResolvedValue([]);
  loadEntityCandidates.mockReset().mockResolvedValue([]);
  bankAndCashAccounts.mockReset().mockResolvedValue([BANK_ACCOUNT]);
  receiptCounterpartAccounts.mockReset().mockResolvedValue([SALES_ACCOUNT]);
  getCommandPatternSuggestions.mockReset().mockResolvedValue({});
  getPartyContact.mockReset().mockResolvedValue(null);
});

describe("resolveExtraction — Sales Intelligence Sprint", () => {
  it("sales_invoice: resolves the customer, picks an income line account, and carries the due date through", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "sales_invoice",
      customer_name: "Musa Ibrahim",
      amount: 50000,
      description: "Rice delivery",
      date: null,
      due_date: "2026-08-15",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(loadEntityCandidates).toHaveBeenCalledWith(ctx, "customer");
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.partyType).toBe("customer");
    expect(proposal.needsParty).toBe(true);
    expect(proposal.needsBank).toBe(false);
    expect(proposal.draft.amount).toBe("50000");
    expect(proposal.draft.dueDate).toBe("2026-08-15");
    expect(proposal.lineAccountId).toBe("acct_sales");
    expect(proposal.warnings.some((w) => w.code === "chooseCustomerForInvoice")).toBe(false);
    expect(proposal.warnings.some((w) => w.code === "enterSaleAmount")).toBe(false);
  });

  it("sales_invoice: missing customer name warns chooseCustomerForInvoice (never 'not sure')", async () => {
    const action: ExtractedAction = {
      action: "sales_invoice",
      customer_name: null,
      amount: 50000,
      description: null,
      date: null,
      due_date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "chooseCustomerForInvoice")).toBe(true);
    expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
  });

  it("sales_invoice: missing/zero amount warns enterSaleAmount", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "sales_invoice",
      customer_name: "Musa Ibrahim",
      amount: null,
      description: null,
      date: null,
      due_date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "enterSaleAmount")).toBe(true);
  });

  it("sales_invoice: no income account found warns noIncomeAccount", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    receiptCounterpartAccounts.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "sales_invoice",
      customer_name: "Musa Ibrahim",
      amount: 50000,
      description: null,
      date: null,
      due_date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.lineAccountId).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "noIncomeAccount")).toBe(true);
  });

  it("credit_note: resolves the customer and warns chooseCustomerForCreditNote/enterCreditAmount when missing", async () => {
    const action: ExtractedAction = {
      action: "credit_note",
      customer_name: null,
      amount: null,
      description: null,
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "chooseCustomerForCreditNote")).toBe(true);
    expect(proposal.warnings.some((w) => w.code === "enterCreditAmount")).toBe(true);
  });

  it("credit_note: resolved customer + amount produce no blocking warnings", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "credit_note",
      customer_name: "Musa Ibrahim",
      amount: 5000,
      description: "Returned goods",
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.draft.amount).toBe("5000");
    expect(proposal.draft.description).toBe("Returned goods");
    expect(proposal.lineAccountId).toBe("acct_sales");
    expect(proposal.warnings.some((w) => w.code === "chooseCustomerForCreditNote")).toBe(false);
    expect(proposal.warnings.some((w) => w.code === "enterCreditAmount")).toBe(false);
  });

  it("refund_receipt: customer is OPTIONAL — a missing name never blocks with a customer warning", async () => {
    const action: ExtractedAction = {
      action: "refund_receipt",
      customer_name: null,
      amount: 5000,
      description: null,
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(loadEntityCandidates).not.toHaveBeenCalled();
    expect(proposal.warnings.some((w) => w.code === "enterRefundAmount")).toBe(false);
    expect(proposal.warnings.every((w) => !w.code.toLowerCase().includes("customer"))).toBe(true);
  });

  it("refund_receipt: resolves the customer when named, needs a bank account, and warns enterRefundAmount if missing", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "refund_receipt",
      customer_name: "Musa Ibrahim",
      amount: null,
      description: null,
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.needsBank).toBe(true);
    expect(proposal.bankAccountId).toBe("acct_bank");
    expect(proposal.warnings.some((w) => w.code === "enterRefundAmount")).toBe(true);
  });

  it("refund_receipt: no bank/cash account found warns noBankAccount", async () => {
    bankAndCashAccounts.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "refund_receipt",
      customer_name: null,
      amount: 5000,
      description: null,
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.bankAccountId).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "noBankAccount")).toBe(true);
  });

  it("view_sales_invoice: list view never requires a party lookup (no per-customer filter exists yet)", async () => {
    const action: ExtractedAction = {
      action: "view_sales_invoice",
      customer_name: null,
      view: "list",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.view).toBe("list");
    expect(proposal.partyId).toBeNull();
    expect(loadEntityCandidates).not.toHaveBeenCalled();
  });

  it("view_sales_invoice: an unrecognized view guess falls back to 'list' (only supported target)", async () => {
    const { viewSalesInvoiceSchema } = await import("@/lib/ai/actions");
    const parsed = viewSalesInvoiceSchema.parse({
      action: "view_sales_invoice",
      customer_name: "Musa Ibrahim",
      // Deliberately invalid — exercises the zod .catch("list") fallback.
      view: "profile",
      ...baseFields(),
    });
    expect(parsed.view).toBe("list");

    const proposal = await resolveExtraction(ctx, parsed);
    expect(proposal.draft.view).toBe("list");
  });

  it("unsupported_sales_action: edit/void/email/apply_payment never say 'not sure' and always warn notYetAvailable", async () => {
    for (const requested of ["edit", "void", "email", "apply_payment"] as const) {
      const action: ExtractedAction = {
        action: "unsupported_sales_action",
        customer_name: "Musa Ibrahim",
        requested,
        ...baseFields(),
      };
      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.warnings.some((w) => w.code === "notYetAvailable")).toBe(true);
      expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
      expect(proposal.action).toBe("unsupported_sales_action");
    }
  });

  it("never leaks candidates across orgs: resolveParty is always called with the caller's ctx", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "sales_invoice",
      customer_name: "Musa Ibrahim",
      amount: 50000,
      description: null,
      date: null,
      due_date: null,
      ...baseFields(),
    };
    await resolveExtraction(ctx, action);
    for (const call of loadEntityCandidates.mock.calls) {
      expect(call[0]).toBe(ctx);
    }
  });
});
