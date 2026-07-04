import { Prisma } from "@prisma/client";

// Allocates the next document number for a given (org, kind) atomically.
//
// Uses INSERT … ON CONFLICT DO UPDATE … RETURNING so the counter is bumped and
// read in a single statement that takes a row lock. Concurrent posts within the
// same organization therefore serialize on that one row instead of all reading
// the same COUNT(*) and colliding on the documents' unique (orgId, number)
// index. Must be called with the transaction client that also writes the
// document, so numbering and the row commit (or roll back) together.
export async function nextDocNumber(
  tx: Prisma.TransactionClient,
  orgId: string,
  kind: string,
  prefix = kind,
): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "document_sequences" ("orgId", "kind", "value")
    VALUES (${orgId}, ${kind}, 1)
    ON CONFLICT ("orgId", "kind")
    DO UPDATE SET "value" = "document_sequences"."value" + 1
    RETURNING "value"
  `;
  const value = Number(rows[0].value);
  return `${prefix}-${String(value).padStart(5, "0")}`;
}
