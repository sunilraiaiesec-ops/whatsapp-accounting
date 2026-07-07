import { beforeEach, describe, expect, it, vi } from "vitest";

const documentCreate = vi.fn();
const checkPlanLimit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { create: documentCreate },
  },
}));

vi.mock("@/lib/billing/enforce", () => ({
  checkPlanLimit,
}));

const { recordDocumentUpload, StorageLimitExceededError } = await import("@/lib/documents/create");

const BASE_INPUT = {
  orgId: "org_1",
  uploadedById: "user_1",
  documentType: "receipt",
  originalFilename: "receipt.jpg",
  storedFilename: "storage/receipt-abc123.webp",
  mimeType: "image/webp",
  originalSizeBytes: 3_200_000,
  optimizedSizeBytes: 420_000,
};

beforeEach(() => {
  documentCreate.mockReset();
  checkPlanLimit.mockReset();
});

describe("recordDocumentUpload — under the limit", () => {
  it("creates the Document row and returns it, with no warning", async () => {
    checkPlanLimit.mockResolvedValue({ ok: true });
    documentCreate.mockResolvedValue({ id: "doc_1", ...BASE_INPUT });

    const result = await recordDocumentUpload(BASE_INPUT);

    expect(checkPlanLimit).toHaveBeenCalledWith("org_1", "documentUpload", { addBytes: 420_000 });
    expect(documentCreate).toHaveBeenCalledWith({
      data: {
        orgId: "org_1",
        uploadedById: "user_1",
        documentType: "receipt",
        linkedTransactionId: null,
        originalFilename: "receipt.jpg",
        storedFilename: "storage/receipt-abc123.webp",
        mimeType: "image/webp",
        originalSizeBytes: 3_200_000,
        optimizedSizeBytes: 420_000,
        thumbnailPath: null,
      },
    });
    expect(result.document).toEqual({ id: "doc_1", ...BASE_INPUT });
    expect(result.warning).toBeUndefined();
  });

  it("passes through a warning from checkPlanLimit even when allowed", async () => {
    checkPlanLimit.mockResolvedValue({ ok: true, warning: "You're using 80% of your storage." });
    documentCreate.mockResolvedValue({ id: "doc_1", ...BASE_INPUT });

    const result = await recordDocumentUpload(BASE_INPUT);
    expect(result.warning).toBe("You're using 80% of your storage.");
  });

  it("passes through optional fields (linkedTransactionId, thumbnailPath)", async () => {
    checkPlanLimit.mockResolvedValue({ ok: true });
    documentCreate.mockResolvedValue({ id: "doc_2" });

    await recordDocumentUpload({
      ...BASE_INPUT,
      linkedTransactionId: "txn_1",
      thumbnailPath: "storage/receipt-abc123-thumb.webp",
    });

    expect(documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        linkedTransactionId: "txn_1",
        thumbnailPath: "storage/receipt-abc123-thumb.webp",
      }),
    });
  });
});

describe("recordDocumentUpload — over the limit", () => {
  it("throws StorageLimitExceededError and never calls prisma.document.create", async () => {
    checkPlanLimit.mockResolvedValue({
      ok: false,
      message: "This upload would exceed your FREE plan's storage limit of 500 MB.",
    });

    await expect(recordDocumentUpload(BASE_INPUT)).rejects.toBeInstanceOf(StorageLimitExceededError);
    await expect(recordDocumentUpload(BASE_INPUT)).rejects.toThrow(
      "This upload would exceed your FREE plan's storage limit of 500 MB.",
    );
    expect(documentCreate).not.toHaveBeenCalled();
  });
});
