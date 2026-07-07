import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pendingTransaction: { create, findFirst, update, findMany },
  },
}));

const serializeForType = vi.fn();
const postApprovedPayload = vi.fn();

vi.mock("@/lib/approvals/payloads", () => ({
  serializeForType: (...args: unknown[]) => serializeForType(...args),
  postApprovedPayload: (...args: unknown[]) => postApprovedPayload(...args),
}));

const computeRiskReview = vi.fn();
vi.mock("@/lib/approvals/risk-review", () => ({
  computeRiskReview: (...args: unknown[]) => computeRiskReview(...args),
}));

const {
  submitForApproval,
  approvePendingTransaction,
  rejectPendingTransaction,
  editThenApprove,
  requestCorrection,
  listPendingApprovals,
  listMySubmissionNotices,
} = await import("@/lib/approvals/engine");
const { ApprovalForbiddenError, ApprovalError } = await import("@/lib/approvals/types");

const ORG_A = "org_a";
const ORG_B = "org_b";

function actor(role: string, orgId = ORG_A, userId = "user_1") {
  return { orgId, userId, role };
}

beforeEach(() => {
  create.mockReset();
  findFirst.mockReset();
  update.mockReset();
  findMany.mockReset();
  serializeForType.mockReset().mockImplementation((_type: string, raw: unknown) => ({ serialized: raw }));
  postApprovedPayload.mockReset().mockResolvedValue({ id: "posted_1", number: "PAY-0001" });
  computeRiskReview.mockReset().mockResolvedValue({ level: "low", score: 0, signals: [], aiNarrative: null });
});

describe("submitForApproval — never touches the ledger", () => {
  it("creates a pending draft with status pending and the serialized payload, without posting anything", async () => {
    create.mockResolvedValue({ id: "pt_1" });
    const raw = { date: new Date(), lines: [] };

    const result = await submitForApproval({
      orgId: ORG_A,
      submittedById: "user_1",
      type: "expense",
      rawPayload: raw,
      baseCurrency: "XAF",
    });

    expect(result).toEqual({ id: "pt_1" });
    expect(serializeForType).toHaveBeenCalledWith("expense", raw);
    expect(postApprovedPayload).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.orgId).toBe(ORG_A);
    expect(data.status).toBe("pending");
    expect(data.submittedById).toBe("user_1");
    expect(data.payload).toEqual({ serialized: raw });
  });
});

describe("approvePendingTransaction — Owner/Admin/Accountant only", () => {
  it("posts through the SAME real posting function with the staged payload, then marks approved", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: { a: 1 } });
    update.mockResolvedValue({});

    const posted = await approvePendingTransaction(actor("OWNER"), "pt_1");

    expect(postApprovedPayload).toHaveBeenCalledWith(ORG_A, "expense", { a: 1 });
    expect(posted).toEqual({ id: "posted_1", number: "PAY-0001" });
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "pt_1" },
      data: { status: "approved", reviewedById: "user_1" },
    });
  });

  it("rejects with ApprovalForbiddenError for a role without approveTransactions, and never posts", async () => {
    await expect(approvePendingTransaction(actor("CASHIER"), "pt_1")).rejects.toBeInstanceOf(ApprovalForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();
    expect(postApprovedPayload).not.toHaveBeenCalled();
  });

  it("rejects for a Manager too (posts directly for lower-risk types, but cannot approve OTHERS' drafts)", async () => {
    await expect(approvePendingTransaction(actor("MANAGER"), "pt_1")).rejects.toBeInstanceOf(ApprovalForbiddenError);
    expect(postApprovedPayload).not.toHaveBeenCalled();
  });

  it("SECURITY: is org-scoped — an approver from a different org cannot approve another org's draft", async () => {
    // findFirst is called with { id, orgId } — simulate the real Prisma
    // behavior of returning null when the row doesn't match BOTH filters.
    findFirst.mockImplementation(async ({ where }: { where: { id: string; orgId: string } }) => {
      if (where.orgId !== ORG_A) return null;
      return { id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: {} };
    });

    await expect(approvePendingTransaction(actor("OWNER", ORG_B), "pt_1")).rejects.toBeInstanceOf(ApprovalError);
    expect(postApprovedPayload).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "pt_1", orgId: ORG_B } });
  });

  it("refuses to re-approve an already-approved transaction", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "approved", payload: {} });
    await expect(approvePendingTransaction(actor("OWNER"), "pt_1")).rejects.toBeInstanceOf(ApprovalError);
    expect(postApprovedPayload).not.toHaveBeenCalled();
  });
});

describe("SECURITY: a gated role cannot bypass approval by calling the enforcement layer directly", () => {
  it("calling approvePendingTransaction as CASHIER (the submitter) still throws — permission is server-side, not UI-hidden", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: {} });
    await expect(approvePendingTransaction(actor("CASHIER"), "pt_1")).rejects.toBeInstanceOf(ApprovalForbiddenError);
    expect(update).not.toHaveBeenCalled();
    expect(postApprovedPayload).not.toHaveBeenCalled();
  });

  it("a client-supplied role override cannot be honored — the check reads actor.role from the trusted server context, not any client input", async () => {
    // Even if a hypothetical caller tried to pass a forged "OWNER" string
    // alongside a real CASHIER session, the actor object passed in must come
    // from requireContext() server-side — this test documents that the
    // function has no other input (like a body flag) that could grant access.
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: {} });
    const forged = { orgId: ORG_A, userId: "user_1", role: "CASHIER" };
    await expect(approvePendingTransaction(forged, "pt_1")).rejects.toBeInstanceOf(ApprovalForbiddenError);
  });
});

describe("editThenApprove", () => {
  it("re-serializes the edited payload, posts it, and stores the edited payload", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: { a: 1 } });
    const edited = { a: 2 };

    await editThenApprove(actor("ADMIN"), "pt_1", edited);

    expect(serializeForType).toHaveBeenCalledWith("expense", edited);
    expect(postApprovedPayload).toHaveBeenCalledWith(ORG_A, "expense", { serialized: edited });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: "approved", payload: { serialized: edited } });
  });

  it("forbidden for a role without approveTransactions", async () => {
    await expect(editThenApprove(actor("MANAGER"), "pt_1", {})).rejects.toBeInstanceOf(ApprovalForbiddenError);
  });
});

describe("rejectPendingTransaction — stores reason, never posts, no ledger impact", () => {
  it("stores the status and reason, and never calls the posting function", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: {} });
    update.mockResolvedValue({});

    await rejectPendingTransaction(actor("ACCOUNTANT"), "pt_1", "Missing receipt");

    expect(postApprovedPayload).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: "rejected",
      rejectionReason: "Missing receipt",
      reviewedById: "user_1",
    });
  });

  it("requires a non-empty reason", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: {} });
    await expect(rejectPendingTransaction(actor("OWNER"), "pt_1", "   ")).rejects.toBeInstanceOf(ApprovalError);
    expect(update).not.toHaveBeenCalled();
  });

  it("forbidden for a role without rejectTransactions", async () => {
    await expect(rejectPendingTransaction(actor("CASHIER"), "pt_1", "reason")).rejects.toBeInstanceOf(
      ApprovalForbiddenError,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("cannot reject an already-approved transaction", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "approved", payload: {} });
    await expect(rejectPendingTransaction(actor("OWNER"), "pt_1", "reason")).rejects.toBeInstanceOf(ApprovalError);
  });
});

describe("requestCorrection", () => {
  it("kicks the draft back to needs_correction with a note, without deleting it", async () => {
    findFirst.mockResolvedValue({ id: "pt_1", orgId: ORG_A, type: "expense", status: "pending", payload: {} });
    await requestCorrection(actor("OWNER"), "pt_1", "Please attach the receipt");
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: "needs_correction",
      rejectionReason: "Please attach the receipt",
    });
    expect(postApprovedPayload).not.toHaveBeenCalled();
  });
});

describe("org scoping — listing helpers", () => {
  it("listPendingApprovals scopes findMany by orgId and pending status only", async () => {
    findMany.mockResolvedValue([]);
    await listPendingApprovals(ORG_A);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: ORG_A, status: "pending" } }),
    );
  });

  it("listMySubmissionNotices scopes by BOTH orgId and submittedById", async () => {
    findMany.mockResolvedValue([]);
    await listMySubmissionNotices(ORG_A, "user_1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_A, submittedById: "user_1", status: { in: ["rejected", "needs_correction"] } },
      }),
    );
  });
});
