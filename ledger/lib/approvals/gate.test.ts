import { beforeEach, describe, expect, it, vi } from "vitest";

const submitForApproval = vi.fn();
vi.mock("@/lib/approvals/engine", () => ({
  submitForApproval: (...args: unknown[]) => submitForApproval(...args),
}));

const { gateTransaction } = await import("@/lib/approvals/gate");

function actor(role: string, approvalWorkflowEnabled: boolean) {
  return { orgId: "org_1", userId: "user_1", role, approvalWorkflowEnabled, baseCurrency: "XAF" };
}

const rawExpense = { date: new Date(), bankAccountId: "acct_1", lines: [{ accountId: "acct_2", amount: 5000n }] };

beforeEach(() => {
  submitForApproval.mockReset().mockResolvedValue({ id: "pt_1" });
});

describe("gateTransaction — the single enforcement point", () => {
  it("toggle off: ungated roles post immediately (not gated), and nothing is submitted for approval", async () => {
    const result = await gateTransaction(actor("CASHIER", false), "expense", rawExpense);
    expect(result).toEqual({ gated: false });
    expect(submitForApproval).not.toHaveBeenCalled();
  });

  it("toggle on + gated role (Cashier): creates a draft instead of letting the caller post directly", async () => {
    const result = await gateTransaction(actor("CASHIER", true), "expense", rawExpense);
    expect(result).toEqual({ gated: true, pendingId: "pt_1" });
    expect(submitForApproval).toHaveBeenCalledTimes(1);
    expect(submitForApproval.mock.calls[0][0]).toMatchObject({
      orgId: "org_1",
      submittedById: "user_1",
      type: "expense",
      rawPayload: rawExpense,
      baseCurrency: "XAF",
    });
  });

  it("toggle on + ungated role (Owner/Admin/Accountant): never gated regardless of amount", async () => {
    const huge = { ...rawExpense, lines: [{ accountId: "acct_2", amount: 999_999_999n }] };
    for (const role of ["OWNER", "ADMIN", "ACCOUNTANT"]) {
      const result = await gateTransaction(actor(role, true), "expense", huge);
      expect(result).toEqual({ gated: false });
    }
    expect(submitForApproval).not.toHaveBeenCalled();
  });

  it("passes attachmentId/aiConfidence through to submitForApproval when provided", async () => {
    await gateTransaction(actor("SALESPERSON", true), "expense", rawExpense, {
      attachmentId: "doc_1",
      aiConfidence: 87,
    });
    expect(submitForApproval.mock.calls[0][0]).toMatchObject({ attachmentId: "doc_1", aiConfidence: 87 });
  });
});
