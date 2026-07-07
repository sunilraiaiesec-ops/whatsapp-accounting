import sharp from "sharp";

import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/billing/plans";

// ---------------------------------------------------------------------------
// Image/PDF optimization for uploaded documents (receipts, invoices, etc).
// The real image work is done by `sharp`, but every caller goes through the
// `ImageProcessor` interface below so tests can inject a fake implementation
// and never need to decode/encode real image bytes — mirrors the test seam
// pattern used for the AI provider (lib/ai/provider.ts#__setAiProviderForTests).
// ---------------------------------------------------------------------------

export class DocumentTooLargeError extends Error {
  constructor() {
    super(`This file is too large. The maximum upload size is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
    this.name = "DocumentTooLargeError";
  }
}

const MAX_DIMENSION_PX = 1600;
const THUMBNAIL_DIMENSION_PX = 300;
const IMAGE_QUALITY = 75;
const THUMBNAIL_QUALITY = 70;

export type OptimizedImage = {
  buffer: Buffer;
  mimeType: string;
};

// Injectable seam: the actual pixel-crunching work. The default
// implementation (SharpImageProcessor below) is backed by `sharp`; tests
// inject a fake that returns canned buffers instantly.
export interface ImageProcessor {
  /** Resize + re-encode the full-size optimized image. */
  optimize(input: Buffer): Promise<OptimizedImage>;
  /** Produce a small thumbnail for list/preview UIs. */
  thumbnail(input: Buffer): Promise<OptimizedImage>;
}

class SharpImageProcessor implements ImageProcessor {
  async optimize(input: Buffer): Promise<OptimizedImage> {
    // `.rotate()` with no args auto-orients the image using its EXIF
    // orientation tag; NOT calling `.withMetadata()` afterwards means sharp
    // strips EXIF/other metadata (including that now-applied orientation
    // tag) from the encoded output by default.
    const pipeline = sharp(input)
      .rotate()
      .resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: "inside", withoutEnlargement: true });

    try {
      const buffer = await pipeline.clone().webp({ quality: IMAGE_QUALITY }).toBuffer();
      return { buffer, mimeType: "image/webp" };
    } catch {
      // WebP encoding failed for any reason (unusual input, missing codec,
      // etc) — fall back to JPEG rather than failing the whole upload.
      const buffer = await pipeline.clone().jpeg({ quality: IMAGE_QUALITY }).toBuffer();
      return { buffer, mimeType: "image/jpeg" };
    }
  }

  async thumbnail(input: Buffer): Promise<OptimizedImage> {
    const pipeline = sharp(input)
      .rotate()
      .resize({
        width: THUMBNAIL_DIMENSION_PX,
        height: THUMBNAIL_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      });

    try {
      const buffer = await pipeline.clone().webp({ quality: THUMBNAIL_QUALITY }).toBuffer();
      return { buffer, mimeType: "image/webp" };
    } catch {
      const buffer = await pipeline.clone().jpeg({ quality: THUMBNAIL_QUALITY }).toBuffer();
      return { buffer, mimeType: "image/jpeg" };
    }
  }
}

let processorOverride: ImageProcessor | null = null;

function getImageProcessor(): ImageProcessor {
  return processorOverride ?? new SharpImageProcessor();
}

// Test seam: inject a fake processor so unit tests never decode/encode real
// image bytes. Pass `null` to restore the real sharp-backed implementation.
export function __setImageProcessorForTests(processor: ImageProcessor | null): void {
  processorOverride = processor;
}

export type OptimizeDocumentInput = {
  buffer: Buffer;
  mimeType: string;
  originalSizeBytes: number;
};

export type OptimizeDocumentResult = {
  buffer: Buffer;
  mimeType: string;
  thumbnailBuffer?: Buffer;
  thumbnailMimeType?: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  message: string;
};

// Builds the UI-facing summary, e.g. "Receipt optimized from 3.2 MB to 420 KB."
export function buildOptimizationMessage(originalBytes: number, optimizedBytes: number): string {
  return `Receipt optimized from ${formatBytes(originalBytes)} to ${formatBytes(optimizedBytes)}.`;
}

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export async function optimizeDocument(input: OptimizeDocumentInput): Promise<OptimizeDocumentResult> {
  // Reject oversized files before any processing is attempted, regardless of
  // file type.
  if (input.originalSizeBytes > MAX_UPLOAD_BYTES) {
    throw new DocumentTooLargeError();
  }

  if (isPdf(input.mimeType)) {
    // TODO: PDF compression (e.g. downsampling embedded images inside the
    // PDF) is intentionally out of scope for this pass — we only validate
    // size here and pass the original bytes through unchanged.
    return {
      buffer: input.buffer,
      mimeType: input.mimeType,
      originalSizeBytes: input.originalSizeBytes,
      optimizedSizeBytes: input.originalSizeBytes,
      message: buildOptimizationMessage(input.originalSizeBytes, input.originalSizeBytes),
    };
  }

  const processor = getImageProcessor();
  const optimized = await processor.optimize(input.buffer);
  const thumbnail = await processor.thumbnail(input.buffer);

  return {
    buffer: optimized.buffer,
    mimeType: optimized.mimeType,
    thumbnailBuffer: thumbnail.buffer,
    thumbnailMimeType: thumbnail.mimeType,
    originalSizeBytes: input.originalSizeBytes,
    optimizedSizeBytes: optimized.buffer.byteLength,
    message: buildOptimizationMessage(input.originalSizeBytes, optimized.buffer.byteLength),
  };
}
