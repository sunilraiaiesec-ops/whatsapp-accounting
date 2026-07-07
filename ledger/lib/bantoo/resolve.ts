import type { CurrentContext } from "@/lib/auth/current";
import {
  bankAndCashAccounts,
  paymentCounterpartAccounts,
  receiptCounterpartAccounts,
  receivableAccount,
} from "@/lib/accounts";
import { pickExpenseAccount, pickSalesAccount } from "@/lib/command-accounts";
import { listInventoryItems } from "@/lib/inventory";
import { MATCH_HIGH, MATCH_MEDIUM, bucketFor, rankMatches } from "@/lib/bantoo/match";
import {
  loadEntityCandidates,
  productDefaultsFromItem,
  resolveCandidates,
  toOptions,
} from "@/lib/bantoo/entities";
import {
  dueDateFromTerms,
  getCommandPatternSuggestions,
  type EntityPatternCandidate,
} from "@/lib/command-patterns";
import {
  LOW_CONFIDENCE_THRESHOLD,
  type ExtractedAction,
} from "@/lib/ai/actions";
import {
  emptyDraft,
  type BantooDraft,
  type BantooFieldReasons,
  type BantooOption,
  type BantooPatternReason,
  type BantooProposal,
  type BantooWarning,
  type BantooWarningCode,
  type MatchBucket,
} from "@/lib/bantoo/types";

function numToStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Blending entity-matching with transaction-pattern learning ------------
// Two interactions (see the module doc comment in lib/command-patterns.ts for
// the "why"):
//   - BOOST: pattern's top candidate is the SAME record the text matcher
//     already found → its effective score gets a bonus (up to +20, scaled
//     from the pattern score), which can push a borderline text match over
//     the auto-select line.
//   - FILL: the text matcher found nothing usable (no query text, or its own
//     top match is below "medium") → use the pattern module's own top
//     candidate directly, bucketed by its own score.
// A pattern suggestion NEVER overrides an already-decent (>=60) text match
// with a *different* record, and NEVER auto-creates anything — `id` is only
// ever an id of an EXISTING record already offered by entity matching or
// found by the pattern module itself (both come from real database rows).
export function blendEntity(
  textTop: { id: string; score: number } | undefined,
  pattern: EntityPatternCandidate | undefined,
): { id: string | null; score: number; reason?: BantooPatternReason } {
  if (!pattern) {
    return textTop
      ? { id: textTop.score >= MATCH_HIGH ? textTop.id : null, score: textTop.score }
      : { id: null, score: 0 };
  }
  if (textTop && textTop.id === pattern.id) {
    const boosted = Math.min(100, textTop.score + Math.round(pattern.score * 0.2));
    return { id: boosted >= MATCH_HIGH ? textTop.id : null, score: boosted, reason: pattern.reason };
  }
  if (!textTop || textTop.score < MATCH_MEDIUM) {
    return { id: pattern.score >= MATCH_HIGH ? pattern.id : null, score: pattern.score, reason: pattern.reason };
  }
  return { id: textTop.score >= MATCH_HIGH ? textTop.id : null, score: textTop.score };
}

// Blends a pattern-learned supplier suggestion into the party resolution
// already computed by resolveParty(). Only FILLS proposal.partyId when the
// text matcher hadn't already resolved one; always surfaces the pattern's
// candidate as an extra dropdown option (even at low confidence, per spec)
// and attaches the human-readable reason for the UI.
function applyPartyPatternBlend(
  proposal: BantooProposal,
  draft: BantooDraft,
  fieldReasons: BantooFieldReasons,
  pattern: EntityPatternCandidate | undefined,
) {
  if (!pattern) return;
  const textTop = proposal.partyOptions[0]
    ? { id: proposal.partyOptions[0].id, score: proposal.partyOptions[0].score ?? 0 }
    : undefined;
  const blended = blendEntity(textTop, pattern);
  if (blended.reason) {
    fieldReasons.supplier = {
      code: blended.reason.code,
      bucket: bucketFor(Math.round(blended.score)),
      params: blended.reason.params,
    };
  }
  if (blended.id && !proposal.partyId) {
    proposal.partyId = blended.id;
    proposal.createParty = false;
    if (blended.id === pattern.id) draft.partyName = pattern.label;
  }
  if (!proposal.partyOptions.some((o) => o.id === pattern.id)) {
    proposal.partyOptions = [
      ...proposal.partyOptions,
      { id: pattern.id, label: pattern.label, score: pattern.score, bucket: pattern.bucket },
    ];
  }
}

// Same idea as applyPartyPatternBlend, for the inventory item field. When the
// pattern-preferred item ends up selected, its stored unit/cost/sale/reorder
// defaults are applied exactly like a normal high-confidence text match would
// (via productDefaultsFromItem) — pattern learning only changes WHICH item
// gets picked, not how its defaults populate.
function applyItemPatternBlend(
  proposal: BantooProposal,
  draft: BantooDraft,
  fieldReasons: BantooFieldReasons,
  items: Awaited<ReturnType<typeof listInventoryItems>>,
  pattern: EntityPatternCandidate | undefined,
) {
  if (!pattern) return;
  const textTop = proposal.itemOptions[0]
    ? { id: proposal.itemOptions[0].id, score: proposal.itemOptions[0].score ?? 0 }
    : undefined;
  const blended = blendEntity(textTop, pattern);
  if (blended.reason) {
    // Attributed to the item field only — the item IS the unit-disambiguating
    // signal (e.g. "50kg bag" is part of the item name), so a separate,
    // identical-looking hint under the Unit combobox would just be noise.
    fieldReasons.item = {
      code: blended.reason.code,
      bucket: bucketFor(Math.round(blended.score)),
      params: blended.reason.params,
    };
  }
  if (blended.id && !proposal.itemId) {
    proposal.itemId = blended.id;
    const selected = items.find((it) => it.id === blended.id);
    if (selected) {
      const defaults = productDefaultsFromItem(selected, draft.currency);
      if (!draft.unit) draft.unit = defaults.unit;
      if (!draft.costPrice) draft.costPrice = defaults.costPrice;
    }
  }
  if (!proposal.itemOptions.some((o) => o.id === pattern.id)) {
    proposal.itemOptions = [
      ...proposal.itemOptions,
      { id: pattern.id, label: pattern.label, score: pattern.score, bucket: pattern.bucket },
    ];
  }
}

// Fills a plain numeric/text draft field from a value-pattern suggestion, but
// ONLY when it's still empty — never overwrites something the AI/rule-based
// extractor (or the user) already provided. Always attaches the reason so the
// UI can show it even for a low-confidence suggestion that wasn't filled in.
function applyValueSuggestion(
  draft: BantooDraft,
  key: "quantity" | "costPrice",
  suggestion: { value: string; score: number; bucket: MatchBucket; reason: BantooPatternReason } | undefined,
  fieldReasons: BantooFieldReasons,
  reasonKey: keyof BantooFieldReasons,
) {
  if (!suggestion) return;
  const alreadySet = draft[key] && Number(draft[key]) > 0;
  if (!alreadySet && suggestion.bucket !== "low") {
    draft[key] = suggestion.value;
  }
  fieldReasons[reasonKey] = {
    code: suggestion.reason.code,
    bucket: suggestion.bucket,
    params: suggestion.reason.params,
  };
}

// Turn a validated ExtractedAction into a client-ready proposal: fills the
// editable draft, matches parties/items, and picks sensible default accounts —
// all scoped to the caller's org. No writes happen here.
export async function resolveExtraction(
  ctx: CurrentContext,
  action: ExtractedAction,
): Promise<BantooProposal> {
  const draft = emptyDraft();
  draft.currency = action.currency || ctx.baseCurrency || "XAF";
  const warnings: BantooWarning[] = [];
  const lowConfidence = action.confidence < LOW_CONFIDENCE_THRESHOLD;

  function warn(code: BantooWarningCode, params?: Record<string, string | number>) {
    warnings.push(params ? { code, params } : { code });
  }

  const proposal: BantooProposal = {
    action: action.action,
    confidence: action.confidence,
    lowConfidence,
    summary: action.summary ?? "",
    warnings,
    draft,
    partyType: null,
    partyId: null,
    createParty: false,
    partyOptions: [],
    itemId: null,
    itemOptions: [],
    unitOptions: [],
    bankAccountId: null,
    bankOptions: [],
    lineAccountId: null,
    lineAccountOptions: [],
    needsItem: false,
    needsParty: false,
    needsBank: false,
    needsLineAccount: false,
    fieldReasons: {},
  };

  if (action.action === "unknown") {
    return proposal;
  }

  const fieldReasons: BantooFieldReasons = proposal.fieldReasons;

  // Shared: resolve a named party (customer/supplier) against the org list using
  // the confidence-bucketed matcher. Auto-selects only a HIGH-confidence match;
  // MEDIUM leaves the best highlighted for the user; LOW offers "create new".
  async function resolveParty(
    name: string | null | undefined,
    type: "customer" | "supplier",
  ): Promise<{ options: BantooOption[]; id: string | null; create: boolean }> {
    const candidates = await loadEntityCandidates(ctx, type);
    const { candidates: ranked, autoId } = name
      ? resolveCandidates(name, candidates)
      : { candidates: [], autoId: null };
    const options = toOptions(ranked);
    // Offer create-new when there is no confident (high) match yet.
    const create = Boolean(name && !autoId && name.trim().length >= 2);
    return { options, id: autoId, create };
  }

  // Distinct free-text units already used in the org (there is no Unit table).
  async function unitOptions(): Promise<BantooOption[]> {
    const units = await loadEntityCandidates(ctx, "unit");
    return units.map((u) => ({ id: u.id, label: u.label }));
  }

  async function bankOptions(): Promise<BantooOption[]> {
    const banks = await bankAndCashAccounts(ctx.orgId);
    return banks.map((b) => ({ id: b.id, label: `${b.code} — ${b.name}` }));
  }

  switch (action.action) {
    case "add_inventory_item": {
      draft.productName = action.product_name ?? "";
      draft.barcode = action.barcode ?? "";
      draft.sku = action.sku ?? "";
      draft.category = action.category ?? "";
      draft.unit = action.unit ?? "";
      draft.quantity = numToStr(action.quantity);
      draft.costPrice = numToStr(action.cost_price);
      draft.salePrice = numToStr(action.sale_price);
      draft.taxRate = numToStr(action.tax_rate);
      draft.reorderLevel = numToStr(action.reorder_level);
      draft.partyName = action.supplier_name ?? "";
      proposal.partyType = "supplier";

      const items = await listInventoryItems(ctx.orgId);
      proposal.unitOptions = await unitOptions();
      // Barcode is the strongest signal; fall back to code/name fuzzy match.
      const barcodeDup = draft.barcode
        ? items.find((it) => it.barcode && it.barcode === draft.barcode.trim())
        : undefined;
      const productCandidates = items.map((it) => ({
        id: it.id,
        label: `${it.code} — ${it.name}`,
        text: [it.name, it.code, it.barcode ?? ""].filter(Boolean).join(" "),
      }));
      const dup = draft.productName ? rankMatches(draft.productName, productCandidates)[0] : undefined;
      if (barcodeDup) {
        warn("barcodeDuplicateReceiveStock", { name: barcodeDup.name });
      } else if (dup && dup.bucket === "high") {
        warn("similarItemReceiveStock", { label: dup.label });
      }
      if (!draft.productName) warn("enterProductName");
      // Opening stock is optional; if provided we also receive it, which needs a supplier.
      if (draft.quantity && Number(draft.quantity) > 0) {
        const party = await resolveParty(draft.partyName, "supplier");
        proposal.partyOptions = party.options;
        proposal.partyId = party.id;
        proposal.createParty = party.create;

        const patterns = await getCommandPatternSuggestions(ctx.orgId, {
          action: "add_inventory_item",
          productQuery: draft.productName,
          partyType: "supplier",
          currency: draft.currency,
        });
        applyPartyPatternBlend(proposal, draft, fieldReasons, patterns.supplier);
        applyValueSuggestion(draft, "quantity", patterns.quantity, fieldReasons, "quantity");
        applyValueSuggestion(draft, "costPrice", patterns.costPrice, fieldReasons, "costPrice");
        if (!draft.costPrice || Number(draft.costPrice) <= 0) {
          warn("openingStockNeedsCost");
        }
      }
      break;
    }

    case "receive_stock": {
      draft.productName = action.product_name ?? "";
      draft.barcode = action.barcode ?? "";
      draft.sku = action.sku ?? "";
      draft.unit = action.unit ?? "";
      draft.quantity = numToStr(action.quantity);
      draft.costPrice = numToStr(action.cost_price);
      draft.partyName = action.supplier_name ?? "";
      draft.date = action.date ?? today();
      proposal.partyType = "supplier";
      proposal.needsItem = true;
      proposal.needsParty = true;

      const items = await listInventoryItems(ctx.orgId);
      proposal.unitOptions = await unitOptions();
      const productCandidates = items.map((it) => ({
        id: it.id,
        label: `${it.code} — ${it.name}`,
        text: [it.name, it.code, it.barcode ?? ""].filter(Boolean).join(" "),
        sub: it.code,
      }));
      // Prefer an exact barcode hit, then a confident code/name match, before
      // offering to create a new item — this avoids duplicates.
      const barcodeMatch = draft.barcode
        ? items.find((it) => it.barcode && it.barcode === draft.barcode.trim())
        : undefined;
      const rankedItems = draft.productName
        ? rankMatches(draft.productName, productCandidates)
        : [];
      proposal.itemOptions = toOptions(rankedItems.length ? rankedItems : []);
      // When no query ranking (or to always allow browsing), fall back to the
      // full item list so the dropdown is usable.
      if (proposal.itemOptions.length === 0) {
        proposal.itemOptions = items.map((it) => ({ id: it.id, label: `${it.code} — ${it.name}`, sub: it.code }));
      }
      const topItem = rankedItems[0];
      proposal.itemId =
        barcodeMatch?.id ?? (topItem && topItem.bucket === "high" ? topItem.id : null);
      // Dependent auto-population: when an existing item is auto-selected, fill
      // unit from that item so the user sees a consistent default. Cost is
      // handled below, AFTER pattern learning: the item's stored value is a
      // static weighted-average cost, while the pattern module's suggestion is
      // the actual LAST purchase price — more relevant, so it takes priority
      // when available; the item average remains the fallback.
      const selected = proposal.itemId
        ? items.find((it) => it.id === proposal.itemId)
        : undefined;
      if (selected && !draft.unit) {
        draft.unit = productDefaultsFromItem(selected, draft.currency).unit;
      }

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.create;

      // Transaction-pattern learning: "Received bread" with no supplier named
      // still ranks the usual bread supplier highly; a generic/ambiguous
      // product match ("rice") gets disambiguated toward the item the org
      // actually buys, carrying its unit along; quantity/cost prefill from the
      // org's own history. A confirmed barcode hit is certain, so we skip
      // item-pattern blending in that case — there is nothing to disambiguate.
      const patterns = await getCommandPatternSuggestions(ctx.orgId, {
        action: "receive_stock",
        productQuery: draft.productName,
        partyType: "supplier",
        resolvedItemId: barcodeMatch?.id ?? null,
        resolvedPartyId: proposal.partyId,
        currency: draft.currency,
      });
      if (!barcodeMatch) {
        applyItemPatternBlend(proposal, draft, fieldReasons, items, patterns.item);
      }
      applyPartyPatternBlend(proposal, draft, fieldReasons, patterns.supplier);
      applyValueSuggestion(draft, "quantity", patterns.quantity, fieldReasons, "quantity");
      applyValueSuggestion(draft, "costPrice", patterns.costPrice, fieldReasons, "costPrice");
      // Fallback: no (or low-confidence) last-purchase-cost pattern — use the
      // selected item's own stored (weighted-average) cost, as before.
      if (!draft.costPrice && selected) {
        draft.costPrice = productDefaultsFromItem(selected, draft.currency).costPrice;
      }

      if (!proposal.itemId) {
        warn(
          draft.productName ? "itemNotInInventory" : "chooseInventoryItem",
          draft.productName ? { name: draft.productName } : undefined,
        );
      }
      if (!draft.partyName) warn("chooseSupplier");
      if (!draft.quantity || Number(draft.quantity) <= 0) {
        warn("enterQuantity");
      }
      if (!draft.costPrice || Number(draft.costPrice) <= 0) {
        warn("enterUnitCost");
      }
      break;
    }

    case "supplier_purchase": {
      draft.partyName = action.supplier_name ?? "";
      draft.amount = numToStr(action.amount);
      draft.description = action.description ?? "";
      draft.paymentMethod = action.payment_method ?? "";
      draft.date = action.date ?? today();
      proposal.partyType = "supplier";
      proposal.needsParty = true;
      proposal.needsLineAccount = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.create;
      if (!draft.partyName) warn("chooseSupplierForBill");
      if (!draft.amount || Number(draft.amount) <= 0) {
        warn("enterInvoiceTotal");
      }

      // Payment terms: "usually paid ~30 days after delivery" — suggests a
      // concrete due date from this supplier's history (see
      // paymentTermsPatternForSupplier in lib/command-patterns.ts for exactly
      // what's derived from vs. approximated). Only fills draft.dueDate when
      // it's still empty; always attaches the reason.
      if (proposal.partyId) {
        const patterns = await getCommandPatternSuggestions(ctx.orgId, {
          action: "supplier_purchase",
          resolvedPartyId: proposal.partyId,
          currency: draft.currency,
        });
        if (patterns.dueDateDays) {
          const invoiceDate = new Date(draft.date || today());
          const suggestedDueDate = dueDateFromTerms(invoiceDate, patterns.dueDateDays.value);
          if (!draft.dueDate && patterns.dueDateDays.bucket !== "low") {
            draft.dueDate = suggestedDueDate;
          }
          fieldReasons.dueDate = {
            code: patterns.dueDateDays.reason.code,
            bucket: patterns.dueDateDays.bucket,
            params: patterns.dueDateDays.reason.params,
          };
        }
      }

      const accounts = await paymentCounterpartAccounts(ctx.orgId);
      const expenses = accounts.filter((a) => a.type === "EXPENSE");
      proposal.lineAccountOptions = expenses.map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
      }));
      const picked = pickExpenseAccount(expenses, draft.description || draft.partyName);
      proposal.lineAccountId = picked?.id ?? expenses[0]?.id ?? null;
      if (!proposal.lineAccountId) {
        warn("noExpensePurchasesAccount");
      }
      break;
    }

    case "customer_payment": {
      draft.partyName = action.customer_name ?? "";
      draft.amount = numToStr(action.amount);
      draft.paymentMethod = action.payment_method ?? "";
      draft.description = action.description ?? "";
      draft.date = action.date ?? today();
      proposal.partyType = "customer";
      proposal.needsParty = true;
      proposal.needsBank = true;
      proposal.needsLineAccount = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.create;
      if (!draft.partyName) warn("chooseCustomer");
      if (!draft.amount || Number(draft.amount) <= 0) {
        warn("enterAmountReceived");
      }

      proposal.bankOptions = await bankOptions();
      proposal.bankAccountId = proposal.bankOptions[0]?.id ?? null;
      if (!proposal.bankAccountId) {
        warn("noBankAccount");
      }

      const lineAccounts = await receiptCounterpartAccounts(ctx.orgId);
      proposal.lineAccountOptions = lineAccounts.map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
      }));
      const ar = lineAccounts.find((a) => a.subtype === "receivable");
      proposal.lineAccountId =
        ar?.id ?? (await receivableAccount(ctx.orgId)).id;
      break;
    }

    case "expense": {
      draft.amount = numToStr(action.amount);
      draft.description = action.description ?? "";
      draft.category = action.category ?? "";
      draft.partyName = action.supplier_name ?? "";
      draft.paymentMethod = action.payment_method ?? "";
      draft.date = action.date ?? today();
      proposal.partyType = "supplier";
      proposal.needsBank = true;
      proposal.needsLineAccount = true;

      if (draft.partyName) {
        const party = await resolveParty(draft.partyName, "supplier");
        proposal.partyOptions = party.options;
        proposal.partyId = party.id;
        proposal.createParty = party.create;
      }
      if (!draft.amount || Number(draft.amount) <= 0) {
        warn("enterAmountPaid");
      }

      proposal.bankOptions = await bankOptions();
      proposal.bankAccountId = proposal.bankOptions[0]?.id ?? null;
      if (!proposal.bankAccountId) {
        warn("noBankAccount");
      }

      const accounts = await paymentCounterpartAccounts(ctx.orgId);
      const expenses = accounts.filter((a) => a.type === "EXPENSE" && a.subtype !== "cogs");
      proposal.lineAccountOptions = expenses.map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
      }));
      const picked = pickExpenseAccount(expenses, draft.category || draft.description);
      proposal.lineAccountId = picked?.id ?? expenses[0]?.id ?? null;
      if (!proposal.lineAccountId) {
        warn("noExpenseAccount");
      }
      break;
    }

    case "sales_receipt": {
      draft.amount = numToStr(action.amount);
      draft.partyName = action.customer_name ?? "";
      draft.description = action.description ?? "";
      draft.paymentMethod = action.payment_method ?? "";
      draft.date = action.date ?? today();
      proposal.partyType = "customer";
      proposal.needsBank = true;
      proposal.needsLineAccount = true;

      if (draft.partyName) {
        const party = await resolveParty(draft.partyName, "customer");
        proposal.partyOptions = party.options;
        proposal.partyId = party.id;
        proposal.createParty = party.create;
      }
      if (!draft.amount || Number(draft.amount) <= 0) {
        warn("enterSaleAmount");
      }

      proposal.bankOptions = await bankOptions();
      proposal.bankAccountId = proposal.bankOptions[0]?.id ?? null;
      if (!proposal.bankAccountId) {
        warn("noBankAccount");
      }

      const lineAccounts = await receiptCounterpartAccounts(ctx.orgId);
      const income = lineAccounts.filter((a) => a.type === "INCOME");
      proposal.lineAccountOptions = income.map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
      }));
      const picked = pickSalesAccount(income);
      proposal.lineAccountId = picked?.id ?? income[0]?.id ?? null;
      if (!proposal.lineAccountId) {
        warn("noIncomeAccount");
      }
      break;
    }
  }

  if (!draft.date) draft.date = today();
  if (lowConfidence) {
    warn("lowConfidence");
  }

  return proposal;
}
