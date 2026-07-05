import type { CurrentContext } from "@/lib/auth/current";
import {
  bankAndCashAccounts,
  paymentCounterpartAccounts,
  receiptCounterpartAccounts,
} from "@/lib/accounts";
import { listInventoryItems } from "@/lib/inventory";
import { listParties } from "@/lib/parties";
import { formatAmount } from "@/lib/money";
import { rankMatches, bucketFor, similarity, type RankInput } from "@/lib/bantoo/match";
import type {
  BantooOption,
  EntitySearchType,
  MatchCandidate,
  ProductDefaults,
} from "@/lib/bantoo/types";

// ---------------------------------------------------------------------------
// Server-only entity layer for Ask Bantoo. Loads the caller's org master data
// as matcher candidates and resolves a query into ranked candidates + an
// auto-select decision. Shared by resolveExtraction (post-extraction) and the
// searchBantooEntities server action (as the user types), so the DTOs stay
// identical across the initial proposal and later dropdown searches.
// Everything is org-scoped via ctx.orgId — never trust a client-supplied id.
// ---------------------------------------------------------------------------

// Minor→major plain number string (no grouping) for form inputs. XAF has 0
// decimals so 1500 minor == "1500"; USD 150000 minor == "1500.00".
function minorToPlain(minor: bigint, currency: string): string {
  return formatAmount(minor, currency).replace(/,/g, "");
}

function decimalToPlain(value: { toString(): string } | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return s === "0" ? "" : s;
}

export function productDefaultsFromItem(
  item: {
    unit: string | null;
    defaultTaxRate: { toString(): string } | null;
    avgCost: bigint;
    salePrice: bigint;
    reorderLevel: { toString(): string } | null;
  },
  currency: string,
): ProductDefaults {
  return {
    unit: item.unit ?? "",
    taxRate: decimalToPlain(item.defaultTaxRate),
    costPrice: item.avgCost > 0n ? minorToPlain(item.avgCost, currency) : "",
    salePrice: item.salePrice > 0n ? minorToPlain(item.salePrice, currency) : "",
    reorderLevel: decimalToPlain(item.reorderLevel),
  };
}

// Load the candidate list for an entity type, scoped to the org. Returns matcher
// inputs (id + label + optional scoring text/sub). Units are derived from the
// free-text `unit` field on items (there is no Unit table); expense categories
// are EXPENSE accounts (excluding COGS); income accounts are INCOME accounts.
export async function loadEntityCandidates(
  ctx: CurrentContext,
  type: EntitySearchType,
): Promise<RankInput[]> {
  switch (type) {
    case "supplier":
    case "customer": {
      const parties = await listParties(ctx.orgId, type);
      return parties.map((p) => ({ id: p.id, label: p.name, text: p.name }));
    }
    case "product": {
      const items = await listInventoryItems(ctx.orgId);
      return items.map((it) => ({
        id: it.id,
        label: `${it.code} — ${it.name}`,
        // Match against name + code + barcode so any of them resolves the item.
        text: [it.name, it.code, it.barcode ?? ""].filter(Boolean).join(" "),
        sub: it.code,
      }));
    }
    case "unit": {
      const items = await listInventoryItems(ctx.orgId);
      const seen = new Set<string>();
      const units: RankInput[] = [];
      for (const it of items) {
        const u = (it.unit ?? "").trim();
        const key = u.toLowerCase();
        if (u && !seen.has(key)) {
          seen.add(key);
          units.push({ id: u, label: u, text: u });
        }
      }
      return units.sort((a, b) => a.label.localeCompare(b.label));
    }
    case "expense_category": {
      const accounts = await paymentCounterpartAccounts(ctx.orgId);
      return accounts
        .filter((a) => a.type === "EXPENSE" && a.subtype !== "cogs")
        .map((a) => ({ id: a.id, label: `${a.code} — ${a.name}`, text: a.name, sub: a.code }));
    }
    case "income_account": {
      const accounts = await receiptCounterpartAccounts(ctx.orgId);
      return accounts
        .filter((a) => a.type === "INCOME")
        .map((a) => ({ id: a.id, label: `${a.code} — ${a.name}`, text: a.name, sub: a.code }));
    }
    case "bank_account": {
      const accounts = await bankAndCashAccounts(ctx.orgId);
      return accounts.map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
        text: a.name,
        sub: a.code,
      }));
    }
  }
}

export function toOptions(candidates: MatchCandidate[]): BantooOption[] {
  return candidates.map((c) => ({
    id: c.id,
    label: c.label,
    sub: c.sub,
    score: c.score,
    bucket: c.bucket,
  }));
}

export type ResolvedField = {
  candidates: MatchCandidate[];
  // Auto-selected id when the top match is high-confidence (>= MATCH_HIGH),
  // otherwise null (medium → user picks from highlighted best; low → create).
  autoId: string | null;
};

// Rank the org's records for `query` and decide whether to auto-select the top.
export function resolveCandidates(query: string, candidates: RankInput[]): ResolvedField {
  const ranked = rankMatches(query, candidates);
  const top = ranked[0];
  const autoId = top && top.bucket === "high" ? top.id : null;
  return { candidates: ranked, autoId };
}

// Search entry point for the live dropdowns. When the query is empty we still
// return the first slice of records so the dropdown is useful before typing.
export async function searchEntities(
  ctx: CurrentContext,
  type: EntitySearchType,
  query: string,
): Promise<MatchCandidate[]> {
  const candidates = await loadEntityCandidates(ctx, type);
  const q = query.trim();
  if (!q) {
    return candidates.slice(0, 8).map((c) => ({
      id: c.id,
      label: c.label,
      sub: c.sub,
      score: 0,
      bucket: "low" as const,
    }));
  }
  return rankMatches(q, candidates);
}

// Exposed for callers that need the raw 0–100 score/bucket of a single pair
// (kept for symmetry / potential reuse).
export function scoreOne(query: string, target: string): { score: number; bucket: ReturnType<typeof bucketFor> } {
  const score = Math.round(similarity(query, target) * 100);
  return { score, bucket: bucketFor(score) };
}
