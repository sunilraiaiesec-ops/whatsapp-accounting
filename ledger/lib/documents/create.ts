import { prisma } from "@/lib/prisma";
import { checkPlanLimit } from "@/lib/billing/enforce";

// ---------------------------------------------------------------------------
// Persists a Document metadata row. This app has no durable blob/file
// storage backend (no S3/Vercel Blob integration) — that's out of scope
// here. The caller is responsible for having already persisted the actual
// file bytes somewhere and passes the resulting storage key/path in as the
// plain `storedFilename` string; this function only ever writes the
// Document row itself, after checking the org's storage plan limit.
// ---------------------------------------------------------------------------

export class StorageLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageLimitExceededError";
  }
}

export type RecordDocumentUploadInput = {
  orgId: string;
  uploadedById: string;
  documentType: string;
  linkedTransactionId?: string | null;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  thumbnailPath?: string | null;
};

export type RecordDocumentUploadResult = {
  document: Awaited<ReturnType<typeof prisma.document.create>>;
  warning?: string;
};

export async function recordDocumentUpload(
  input: RecordDocumentUploadInput,
): Promise<RecordDocumentUploadResult> {
  const check = await checkPlanLimit(input.orgId, "documentUpload", {
    addBytes: input.optimizedSizeBytes,
  });
  if (!check.ok) {
    throw new StorageLimitExceededError(check.message);
  }

  const document = await prisma.document.create({
    data: {
      orgId: input.orgId,
      uploadedById: input.uploadedById,
      documentType: input.documentType,
      linkedTransactionId: input.linkedTransactionId ?? null,
      originalFilename: input.originalFilename,
      storedFilename: input.storedFilename,
      mimeType: input.mimeType,
      originalSizeBytes: input.originalSizeBytes,
      optimizedSizeBytes: input.optimizedSizeBytes,
      thumbnailPath: input.thumbnailPath ?? null,
    },
  });

  return { document, warning: check.warning };
}
