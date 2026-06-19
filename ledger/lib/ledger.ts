import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class LedgerError extends Error {}

export type PostLine = {
  accountId: string;
  debit?: bigint;
  credit?: bigint;
  partyId?: string | null;
  memo?: string | null;
};

export type PostEntryInput = {
  orgId: string;
  entryDate: Date;
  description?: string | null;
  reference?: string | null;
  sourceType?: string;
  sourceId?: string | null;
  lines: PostLine[];
};

type TxClient = Prisma.TransactionClient | typeof prisma;

function normalizeLines(lines: PostLine[]) {
  return lines.map((line, index) => {
    const debit = line.debit ?? 0n;
    const credit = line.credit ?? 0n;

    if (debit < 0n || credit < 0n) {
      throw new LedgerError(`Line ${index + 1}: amounts must not be negative`);
    }
    if (debit > 0n && credit > 0n) {
      throw new LedgerError(
        `Line ${index + 1}: a line cannot have both a debit and a credit`,
      );
    }
    if (debit === 0n && credit === 0n) {
      throw new LedgerError(`Line ${index + 1}: amount must be non-zero`);
    }
    return { ...line, debit, credit };
  });
}

// Validates and balances an entry, then verifies accounts and writes it using
// the supplied transaction client. Use this when a document needs to post its
// ledger entry inside the same transaction as the document record itself.
export async function postEntryWithin(
  tx: Prisma.TransactionClient,
  input: PostEntryInput,
) {
  if (input.lines.length < 2) {
    throw new LedgerError("An entry needs at least two lines");
  }

  const lines = normalizeLines(input.lines);

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0n);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0n);
  if (totalDebit !== totalCredit) {
    throw new LedgerError(
      `Entry is not balanced: debits ${totalDebit} != credits ${totalCredit}`,
    );
  }

  await assertAccountsBelongToOrg(
    tx,
    input.orgId,
    lines.map((l) => l.accountId),
  );

  return tx.journalEntry.create({
    data: {
      orgId: input.orgId,
      entryDate: input.entryDate,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: input.sourceType ?? "manual",
      sourceId: input.sourceId ?? null,
      lines: {
        create: lines.map((l) => ({
          orgId: input.orgId,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          partyId: l.partyId ?? null,
          memo: l.memo ?? null,
        })),
      },
    },
    include: { lines: true },
  });
}

// Posts a balanced journal entry. The fundamental invariant of double-entry
// accounting — total debits == total credits — is enforced here, and all
// referenced accounts are verified to belong to the organization.
export async function postEntry(input: PostEntryInput) {
  return prisma.$transaction((tx) => postEntryWithin(tx, input));
}

// Removes a journal entry and its lines (used when editing a document in place).
export async function removeEntryWithin(
  tx: Prisma.TransactionClient,
  entryId: string,
) {
  await tx.journalEntry.delete({ where: { id: entryId } });
}

async function assertAccountsBelongToOrg(
  tx: TxClient,
  orgId: string,
  accountIds: string[],
) {
  const unique = [...new Set(accountIds)];
  const found = await tx.account.findMany({
    where: { orgId, id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new LedgerError(
      "One or more accounts do not exist in this organization",
    );
  }
}
