import { createParty } from "@/lib/parties";
import { createReceipt, createPayment, DocumentError } from "@/lib/documents";
import { postEntry, LedgerError } from "@/lib/ledger";
import { parseAmount } from "@/lib/money";
import type { ImportResult, ResolvedImportRow } from "@/lib/import/types";

function parseDate(value: string | null): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type ExecuteOptions = {
  createParties: boolean;
  currency: string;
};

export async function executeImport(
  orgId: string,
  rows: ResolvedImportRow[],
  options: ExecuteOptions,
): Promise<ImportResult> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const partyCache = new Map<string, string>();

  async function resolvePartyId(name: string, type: "customer" | "supplier"): Promise<string | null> {
    if (!name.trim()) return null;
    const key = `${type}:${name.toLowerCase()}`;
    if (partyCache.has(key)) return partyCache.get(key)!;
    if (!options.createParties) return null;
    const party = await createParty(orgId, { name: name.trim(), type });
    partyCache.set(key, party.id);
    return party.id;
  }

  const journalGroups = groupJournalRows(rows, options.currency);

  for (const group of journalGroups) {
    try {
      const lines = group
        .map((row) => {
          if (!row.accountId) return null;
          const debit = row.debit ? parseAmount(row.debit, options.currency) : 0n;
          const credit = row.credit ? parseAmount(row.credit, options.currency) : 0n;
          if (debit === 0n && credit === 0n && row.amount) {
            const amt = parseAmount(row.amount, options.currency);
            return { accountId: row.accountId, debit: amt, credit: 0n, memo: row.description };
          }
          return {
            accountId: row.accountId,
            debit,
            credit,
            memo: row.description || null,
          };
        })
        .filter(Boolean) as {
        accountId: string;
        debit: bigint;
        credit: bigint;
        memo: string | null;
      }[];

      if (lines.length < 2) {
        skipped += group.length;
        errors.push(`Row ${group[0]?.rowNumber}: journal entry needs at least two lines.`);
        continue;
      }

      await postEntry({
        orgId,
        entryDate: parseDate(group[0]?.date ?? null),
        description: group[0]?.description || "Imported journal entry",
        reference: group[0]?.reference || null,
        sourceType: "import",
        lines,
      });
      imported += group.length;
    } catch (err) {
      skipped += group.length;
      errors.push(
        `Journal group row ${group[0]?.rowNumber}: ${err instanceof LedgerError ? err.message : "Could not post"}`,
      );
    }
  }

  for (const row of rows.filter((r) => r.kind === "receipt")) {
    try {
      if (!row.bankAccountId || !row.lineAccountId) {
        skipped += 1;
        errors.push(`Row ${row.rowNumber}: missing bank or income account.`);
        continue;
      }
      const amount = parseAmount(row.amount, options.currency);
      if (amount <= 0n) {
        skipped += 1;
        continue;
      }
      const partyId =
        row.partyId ??
        (await resolvePartyId(row.partyName, "customer"));
      await createReceipt(orgId, {
        date: parseDate(row.date),
        bankAccountId: row.bankAccountId,
        partyId,
        reference: row.reference || null,
        description: row.description || null,
        lines: [{ accountId: row.lineAccountId, amount, memo: row.description || null }],
      });
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(
        `Row ${row.rowNumber}: ${err instanceof DocumentError ? err.message : "Receipt import failed"}`,
      );
    }
  }

  for (const row of rows.filter((r) => r.kind === "payment")) {
    try {
      if (!row.bankAccountId || !row.lineAccountId) {
        skipped += 1;
        errors.push(`Row ${row.rowNumber}: missing bank or expense account.`);
        continue;
      }
      const amount = parseAmount(row.amount, options.currency);
      if (amount <= 0n) {
        skipped += 1;
        continue;
      }
      const partyId =
        row.partyId ??
        (await resolvePartyId(row.partyName, "supplier"));
      await createPayment(orgId, {
        date: parseDate(row.date),
        bankAccountId: row.bankAccountId,
        partyId,
        reference: row.reference || null,
        description: row.description || null,
        lines: [{ accountId: row.lineAccountId, amount, memo: row.description || null }],
      });
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(
        `Row ${row.rowNumber}: ${err instanceof DocumentError ? err.message : "Payment import failed"}`,
      );
    }
  }

  for (const row of rows.filter((r) => r.kind === "party")) {
    try {
      if (!row.partyName.trim()) {
        skipped += 1;
        continue;
      }
      const type = /supplier|vendor|fournisseur/i.test(row.description + row.typeLabel)
        ? "supplier"
        : "customer";
      await resolvePartyId(row.partyName, type);
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(`Row ${row.rowNumber}: could not create party.`);
    }
  }

  return { imported, skipped, errors: errors.slice(0, 20) };
}

function groupJournalRows(rows: ResolvedImportRow[], currency: string): ResolvedImportRow[][] {
  const journal = rows.filter((r) => r.kind === "journal");
  const groups: ResolvedImportRow[][] = [];
  let current: ResolvedImportRow[] = [];

  for (const row of journal) {
    current.push(row);
    const debits = sumSide(current, "debit", currency);
    const credits = sumSide(current, "credit", currency);
    if (debits > 0n && debits === credits) {
      groups.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    if (current.length === 1 && current[0].amount && current[0].accountId) {
      groups.push(current);
    } else {
      groups.push(current);
    }
  }

  return groups;
}

function sumSide(rows: ResolvedImportRow[], side: "debit" | "credit", currency: string): bigint {
  return rows.reduce((s, r) => {
    const raw = side === "debit" ? r.debit : r.credit;
    if (!raw) return s;
    try {
      return s + parseAmount(raw, currency);
    } catch {
      return s;
    }
  }, 0n);
}
