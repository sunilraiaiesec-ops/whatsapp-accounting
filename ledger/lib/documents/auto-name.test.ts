import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isAiConfiguredMock, extractJsonMock } = vi.hoisted(() => ({
  isAiConfiguredMock: vi.fn(),
  extractJsonMock: vi.fn(),
}));

vi.mock("@/lib/ai/provider", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/provider")>();
  return {
    ...actual,
    isAiConfigured: isAiConfiguredMock,
    getAiProvider: () => ({ name: "fake", extractJson: extractJsonMock }),
  };
});

import { AiError } from "@/lib/ai/provider";
import { deterministicDocumentName, generateDocumentName } from "@/lib/documents/auto-name";

const DATE = new Date("2026-07-05T12:00:00Z");

beforeEach(() => {
  isAiConfiguredMock.mockReset().mockReturnValue(false);
  extractJsonMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("deterministicDocumentName", () => {
  it("formats a purchase invoice with a party name", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "purchase_invoice",
        originalFilename: "scan001.pdf",
        partyName: "Aqua General Trading",
      }),
    ).toBe("2026-07-05 Purchase Invoice - Aqua General Trading.pdf");
  });

  it("formats a sales invoice with no party name (omits the ' - Name' suffix)", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "sales_invoice",
        originalFilename: "invoice.png",
      }),
    ).toBe("2026-07-05 Sales Invoice.png");
  });

  it("formats a receipt", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "receipt",
        originalFilename: "photo.jpg",
        partyName: "Rosa's Shop",
      }),
    ).toBe("2026-07-05 Receipt - Rosa's Shop.jpg");
  });

  it("formats a payment", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "payment",
        originalFilename: "doc.webp",
      }),
    ).toBe("2026-07-05 Payment.webp");
  });

  it("formats a goods receipt", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "goods_receipt",
        originalFilename: "grn.pdf",
      }),
    ).toBe("2026-07-05 Goods Receipt.pdf");
  });

  it("title-cases an unknown document type as a fallback", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "credit_note",
        originalFilename: "doc.pdf",
      }),
    ).toBe("2026-07-05 Credit Note.pdf");
  });

  it("sanitizes filesystem-unsafe characters out of the party name", () => {
    expect(
      deterministicDocumentName({
        date: DATE,
        documentType: "receipt",
        originalFilename: "doc.pdf",
        partyName: 'Weird/Name:With*Bad<Chars>?',
      }),
    ).toBe("2026-07-05 Receipt - WeirdNameWithBadChars.pdf");
  });
});

describe("generateDocumentName — AI not configured", () => {
  it("always returns the deterministic name, even with extractedText provided", async () => {
    isAiConfiguredMock.mockReturnValue(false);
    const result = await generateDocumentName(
      { date: DATE, documentType: "receipt", originalFilename: "doc.pdf" },
      "Some extracted receipt text mentioning Rosa's Shop",
    );
    expect(result).toBe(deterministicDocumentName({ date: DATE, documentType: "receipt", originalFilename: "doc.pdf" }));
    expect(extractJsonMock).not.toHaveBeenCalled();
  });

  it("returns the deterministic name when no extractedText is given, even if AI is configured", async () => {
    isAiConfiguredMock.mockReturnValue(true);
    const result = await generateDocumentName({
      date: DATE,
      documentType: "receipt",
      originalFilename: "doc.pdf",
    });
    expect(result).toBe(deterministicDocumentName({ date: DATE, documentType: "receipt", originalFilename: "doc.pdf" }));
    expect(extractJsonMock).not.toHaveBeenCalled();
  });
});

describe("generateDocumentName — AI configured", () => {
  it("falls back to the deterministic name when the AI call throws", async () => {
    isAiConfiguredMock.mockReturnValue(true);
    extractJsonMock.mockRejectedValue(new AiError("boom"));

    const result = await generateDocumentName(
      { date: DATE, documentType: "receipt", originalFilename: "doc.pdf" },
      "Some extracted text",
    );
    expect(result).toBe(deterministicDocumentName({ date: DATE, documentType: "receipt", originalFilename: "doc.pdf" }));
  });

  it("falls back to the deterministic name on an unexpected error type", async () => {
    isAiConfiguredMock.mockReturnValue(true);
    extractJsonMock.mockRejectedValue(new Error("network exploded"));

    const result = await generateDocumentName(
      { date: DATE, documentType: "receipt", originalFilename: "doc.pdf" },
      "Some extracted text",
    );
    expect(result).toBe(deterministicDocumentName({ date: DATE, documentType: "receipt", originalFilename: "doc.pdf" }));
  });

  it("uses a sane AI-extracted party name when there wasn't one already known", async () => {
    isAiConfiguredMock.mockReturnValue(true);
    extractJsonMock.mockResolvedValue({ partyName: "Aqua General Trading" });

    const result = await generateDocumentName(
      { date: DATE, documentType: "purchase_invoice", originalFilename: "scan.pdf" },
      "INVOICE from Aqua General Trading, total 12,000 XAF",
    );
    expect(result).toBe("2026-07-05 Purchase Invoice - Aqua General Trading.pdf");
  });

  it("falls back to the deterministic name when the AI response is not sane (empty/null)", async () => {
    isAiConfiguredMock.mockReturnValue(true);
    extractJsonMock.mockResolvedValue({ partyName: null });

    const result = await generateDocumentName(
      { date: DATE, documentType: "receipt", originalFilename: "doc.pdf" },
      "Illegible text",
    );
    expect(result).toBe(deterministicDocumentName({ date: DATE, documentType: "receipt", originalFilename: "doc.pdf" }));
  });

  it("does not call the AI when a party name is already known", async () => {
    isAiConfiguredMock.mockReturnValue(true);
    const result = await generateDocumentName(
      { date: DATE, documentType: "receipt", originalFilename: "doc.pdf", partyName: "Rosa's Shop" },
      "Some extracted text",
    );
    expect(extractJsonMock).not.toHaveBeenCalled();
    expect(result).toBe("2026-07-05 Receipt - Rosa's Shop.pdf");
  });
});
