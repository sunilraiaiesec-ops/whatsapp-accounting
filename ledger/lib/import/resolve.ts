import { rankParties } from "@/lib/command-match";
import type { ParsedImportRow, ResolvedImportRow } from "@/lib/import/types";

type AccountOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rankAccounts(query: string, accounts: AccountOption[]) {
  const nq = normalize(query);
  if (!nq) return [];

  return accounts
    .map((a) => {
      const label = `${a.code} ${a.name}`;
      const nl = normalize(label);
      let score = 0;
      if (nl === nq || normalize(a.code) === nq) score = 1;
      else if (nl.includes(nq) || nq.includes(nl)) score = 0.9;
      else if (normalize(a.name) === nq) score = 0.95;
      else {
        const tokens = nq.split(" ").filter(Boolean);
        const hits = tokens.filter((t) => nl.includes(t)).length;
        score = hits / Math.max(tokens.length, 1);
      }
      return { id: a.id, label, score };
    })
    .filter((a) => a.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function resolveImportRows(
  rows: ParsedImportRow[],
  accounts: AccountOption[],
  parties: { id: string; name: string; type: string }[],
  defaultBankId: string | null,
): ResolvedImportRow[] {
  const banks = accounts.filter((a) => a.subtype === "bank" || a.subtype === "cash");
  const incomeOrAr = accounts.filter(
    (a) => a.type === "INCOME" || a.subtype === "receivable",
  );
  const expenseOrAp = accounts.filter(
    (a) => a.type === "EXPENSE" || a.subtype === "payable",
  );

  return rows.map((row) => {
    const warnings = [...row.warnings];
    const resolved: ResolvedImportRow = { ...row };

    if (row.bankAccountLabel) {
      const match = rankAccounts(row.bankAccountLabel, banks)[0];
      if (match && match.score >= 0.85) resolved.bankAccountId = match.id;
      else warnings.push(`Bank account not matched: "${row.bankAccountLabel}"`);
    } else if (defaultBankId && (row.kind === "receipt" || row.kind === "payment")) {
      resolved.bankAccountId = defaultBankId;
    }

    const accountQuery = row.accountLabel || row.lineAccountLabel;
    if (accountQuery) {
      const match = rankAccounts(accountQuery, accounts)[0];
      if (match && match.score >= 0.85) {
        resolved.accountId = match.id;
        resolved.lineAccountId = match.id;
      } else {
        warnings.push(`Account not matched: "${accountQuery}"`);
      }
    } else if (row.kind === "receipt") {
      resolved.lineAccountId =
        incomeOrAr.find((a) => a.subtype === "receivable")?.id ??
        incomeOrAr.find((a) => a.subtype === "sales")?.id ??
        incomeOrAr[0]?.id;
    } else if (row.kind === "payment") {
      resolved.lineAccountId =
        expenseOrAp.find((a) => a.subtype === "payable")?.id ??
        expenseOrAp.find((a) => a.code === "6000")?.id ??
        expenseOrAp[0]?.id;
    }

    if (row.partyName) {
      const ranked = rankParties(row.partyName, parties);
      const top = ranked[0];
      if (top && top.score >= 0.85) resolved.partyId = top.id;
      else warnings.push(`Party not matched: "${row.partyName}" (will create if enabled).`);
    }

    resolved.warnings = warnings;
    return resolved;
  });
}
