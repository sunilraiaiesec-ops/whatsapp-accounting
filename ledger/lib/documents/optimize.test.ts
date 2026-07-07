import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DocumentTooLargeError,
  __setImageProcessorForTests,
  buildOptimizationMessage,
  optimizeDocument,
  type ImageProcessor,
} from "@/lib/documents/optimize";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/billing/plans";

const optimizeMock = vi.fn();
const thumbnailMock = vi.fn();

const fakeProcessor: ImageProcessor = {
  optimize: optimizeMock,
  thumbnail: thumbnailMock,
};

beforeEach(() => {
  optimizeMock.mockReset().mockResolvedValue({
    buffer: Buffer.from("optimized-image-bytes"),
    mimeType: "image/webp",
  });
  thumbnailMock.mockReset().mockResolvedValue({
    buffer: Buffer.from("thumb"),
    mimeType: "image/webp",
  });
  __setImageProcessorForTests(fakeProcessor);
});

afterEach(() => {
  __setImageProcessorForTests(null);
});

describe("optimizeDocument — size guard", () => {
  it("rejects an oversized image before any processing is attempted", async () => {
    await expect(
      optimizeDocument({
        buffer: Buffer.from("irrelevant"),
        mimeType: "image/jpeg",
        originalSizeBytes: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(DocumentTooLargeError);

    expect(optimizeMock).not.toHaveBeenCalled();
    expect(thumbnailMock).not.toHaveBeenCalled();
  });

  it("includes the max size in the error message", async () => {
    await expect(
      optimizeDocument({
        buffer: Buffer.from("irrelevant"),
        mimeType: "image/jpeg",
        originalSizeBytes: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toThrow(new RegExp(formatBytes(MAX_UPLOAD_BYTES).replace(".", "\\.")));
  });

  it("accepts a file exactly at the limit", async () => {
    const optimizedBytes = Buffer.from("optimized-image-bytes").byteLength;
    const result = await optimizeDocument({
      buffer: Buffer.from("irrelevant"),
      mimeType: "image/jpeg",
      originalSizeBytes: MAX_UPLOAD_BYTES,
    });
    expect(result.optimizedSizeBytes).toBe(optimizedBytes);
  });
});

describe("optimizeDocument — images (via injected fake processor)", () => {
  it("returns the optimized buffer/mime type, sizes, and a friendly message", async () => {
    // A small stand-in buffer — its content is irrelevant since the fake
    // processor never actually decodes it. `originalSizeBytes` (not the
    // buffer's real length) is what represents the ~3.2 MB "original file".
    const original = Buffer.from("fake-original-image-bytes");
    const originalSizeBytes = 3_200_000;
    const result = await optimizeDocument({
      buffer: original,
      mimeType: "image/jpeg",
      originalSizeBytes,
    });

    expect(optimizeMock).toHaveBeenCalledWith(original);
    expect(thumbnailMock).toHaveBeenCalledWith(original);
    expect(result.mimeType).toBe("image/webp");
    expect(result.buffer.toString()).toBe("optimized-image-bytes");
    expect(result.thumbnailBuffer?.toString()).toBe("thumb");
    expect(result.originalSizeBytes).toBe(originalSizeBytes);
    expect(result.optimizedSizeBytes).toBe(Buffer.from("optimized-image-bytes").byteLength);
    expect(result.message).toBe(buildOptimizationMessage(originalSizeBytes, result.optimizedSizeBytes));
  });

  it("builds the exact 'Receipt optimized from X to Y.' message format", () => {
    expect(buildOptimizationMessage(3_200_000, 420_000)).toBe("Receipt optimized from 3.05 MB to 410 KB.");
  });
});

describe("optimizeDocument — PDFs", () => {
  it("rejects an oversized PDF without calling any image processor", async () => {
    await expect(
      optimizeDocument({
        buffer: Buffer.from("%PDF-1.4 fake"),
        mimeType: "application/pdf",
        originalSizeBytes: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(DocumentTooLargeError);

    expect(optimizeMock).not.toHaveBeenCalled();
    expect(thumbnailMock).not.toHaveBeenCalled();
  });

  it("accepts a PDF under the limit and passes it through unchanged, without calling any image processor", async () => {
    const buffer = Buffer.from("%PDF-1.4 fake pdf contents");
    const result = await optimizeDocument({
      buffer,
      mimeType: "application/pdf",
      originalSizeBytes: buffer.byteLength,
    });

    expect(optimizeMock).not.toHaveBeenCalled();
    expect(thumbnailMock).not.toHaveBeenCalled();
    expect(result.buffer).toBe(buffer);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.originalSizeBytes).toBe(buffer.byteLength);
    expect(result.optimizedSizeBytes).toBe(buffer.byteLength);
    expect(result.thumbnailBuffer).toBeUndefined();
  });
});
