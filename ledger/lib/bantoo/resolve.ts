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
import { resolvePeriodToRange } from "@/lib/command-parse";
import { getPartyContact, normalizeText, type PartyContactInfo } from "@/lib/parties";
import {
  LOW_CONFIDENCE_THRESHOLD,
  type CreateCustomerAction,
  type CreateSupplierAction,
  type EditCustomerAction,
  type ExtractedAction,
} from "@/lib/ai/actions";
import {
  emptyDraft,
  type BantooDraft,
  type BantooFieldReasons,
  type BantooOption,
  type BantooPatternReason,
  type BantooPlanStep,
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

// --- Safety fix: silent customer identity merging ---------------------------
// A name match alone is never enough to silently reuse an existing customer
// for create_customer — see the module-level warning `possibleDuplicateCustomer`.
// This only flags a conflict when BOTH sides actually have a value AND they
// disagree; a field the existing record simply doesn't have yet (so the new
// request is just filling it in) is not a conflict.
function fieldConflicts(newValue: string, existingValue: string | null): boolean {
  if (!newValue.trim() || !existingValue?.trim()) return false;
  return normalizeText(newValue) !== normalizeText(existingValue);
}

function customerConflictsWithExisting(
  existing: PartyContactInfo,
  fields: { city: string; phone: string; whatsapp: string },
): boolean {
  return (
    fieldConflicts(fields.city, existing.city) ||
    fieldConflicts(fields.phone, existing.phone) ||
    fieldConflicts(fields.whatsapp, existing.whatsapp)
  );
}

// Second half of the same safety fix: a field-conflict check alone still
// silently auto-attaches create_customer to an unrelated existing party when
// there is NO conflicting field to catch it — e.g. a bare "add Golu Transport
// as a customer" (no city/phone/whatsapp mentioned at all) against an
// existing "golu" record, where lib/bantoo/match.ts's substring-containment
// rule scores "golu" vs "golu transport" as 90 (>= MATCH_HIGH), auto-selects
// it, finds nothing to conflict with (the existing record and the new
// request are both simply empty on every field), and silently returns
// success against the WRONG, pre-existing "golu" party — never creating
// "Golu Transport" at all and never telling the user any of this happened.
// This is the live-user-reported "I added the client again and it doesn't
// show in the customers list" bug.
//
// Fix: only treat a match as safe-to-auto-associate-silently when the name
// itself is an exact match (case/accent/whitespace-insensitive) — the one
// case where "this is obviously the same contact" needs no confirmation at
// all. Any non-exact match (fuzzy typo, substring, token-subset — anything
// that only cleared the MATCH_HIGH bucket without being textually identical)
// is treated exactly like a field conflict: it always surfaces the
// duplicateCandidate prompt so the user explicitly picks "use existing" or
// "create new" (via the existing duplicateResolution/forceCreate mechanism)
// instead of the system silently guessing.
function isExactCustomerNameMatch(existingName: string, newName: string): boolean {
  return normalizeText(existingName) === normalizeText(newName);
}

// --- Multi-step Task Planning ------------------------------------------------
// Builds the ordered checklist shown in the preview from every field the
// extracted action actually carries — see the BantooPlanStep doc comment in
// lib/bantoo/types.ts. Reads straight from the ExtractedAction (not the
// draft) so edit_customer's plan reflects only what was actually REQUESTED to
// change, never fields merely pre-filled from the existing record.
//
// Shared by create_customer/edit_customer/create_supplier — the plan's FIRST
// step code (and, for a post-save profile open, the LAST step's code) is the
// only thing that varies per action; every other field (city/phone/whatsapp/
// note/unsupported_requests) is handled identically regardless of party type.
// This is deliberate: the plan's entity-type label is derived from the exact
// same `action.action` the caller is already branching on, never a second,
// independently-guessed label that could drift out of sync with it (see the
// launch-blocking bug postmortem above createSupplierSchema in
// lib/ai/actions.ts for why that consistency matters).
function buildPartyPlan(
  createCode: "createCustomer" | "createSupplier",
  openProfileCode: "openProfile" | "openSupplierProfile",
  action: CreateCustomerAction | EditCustomerAction | CreateSupplierAction,
  isEdit: boolean,
  primaryName: string,
): BantooPlanStep[] {
  const steps: BantooPlanStep[] = [
    {
      code: isEdit ? "editCustomer" : createCode,
      status: "ready",
      ...(primaryName ? { params: { name: primaryName } } : {}),
    },
  ];
  if (action.city?.trim()) steps.push({ code: "setCity", status: "ready", params: { value: action.city.trim() } });
  if (action.phone?.trim()) steps.push({ code: "setPhone", status: "ready", params: { value: action.phone.trim() } });
  if (action.whatsapp?.trim())
    steps.push({ code: "setWhatsapp", status: "ready", params: { value: action.whatsapp.trim() } });
  if (action.note?.trim()) steps.push({ code: "setNote", status: "ready", params: { value: action.note.trim() } });
  if (action.post_action === "open_profile") {
    steps.push({ code: openProfileCode, status: "ready" });
  }
  for (const request of action.unsupported_requests ?? []) {
    steps.push({ code: "unsupportedStep", status: "unavailable", params: { request } });
  }
  return steps;
}

function buildCustomerPlan(
  action: CreateCustomerAction | EditCustomerAction,
  isEdit: boolean,
  primaryName: string,
): BantooPlanStep[] {
  return buildPartyPlan("createCustomer", "openProfile", action, isEdit, primaryName);
}

// Supplier & Purchasing Intelligence Sprint mirror of buildCustomerPlan —
// create_supplier is never an edit, so isEdit is always false.
function buildSupplierPlan(action: CreateSupplierAction, primaryName: string): BantooPlanStep[] {
  return buildPartyPlan("createSupplier", "openSupplierProfile", action, false, primaryName);
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
    plan: [],
    duplicateCandidate: null,
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

  // Shared warning trio for the "existing customer" workflows below: no name
  // given, name given but nothing matched, or name given but ambiguous
  // (no single confident match yet). Never "not sure" for these — always one
  // of these precise, actionable codes instead.
  function warnCustomerResolution(name: string, target: BantooProposal) {
    if (!name.trim()) {
      warn("enterCustomerName");
    } else if (!target.partyId && target.partyOptions.length === 0) {
      warn("customerNotFound", { name });
    } else if (!target.partyId && target.partyOptions.length > 0) {
      warn("customerAmbiguous", { name });
    }
  }

  // Supplier & Purchasing Intelligence Sprint mirror of warnCustomerResolution
  // above — same trio of precise, actionable codes, never "not sure".
  function warnSupplierResolution(name: string, target: BantooProposal) {
    if (!name.trim()) {
      warn("enterSupplierName");
    } else if (!target.partyId && target.partyOptions.length === 0) {
      warn("supplierNotFound", { name });
    } else if (!target.partyId && target.partyOptions.length > 0) {
      warn("supplierAmbiguous", { name });
    }
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

    case "create_customer": {
      draft.partyName = action.customer_name ?? "";
      draft.city = action.city ?? "";
      draft.phone = action.phone ?? "";
      draft.whatsapp = action.whatsapp ?? "";
      draft.note = action.note ?? "";
      draft.postAction = action.post_action ?? "";
      proposal.partyType = "customer";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;

      if (party.id) {
        // Safety fix: a name match is auto-selected here (MATCH_HIGH), but
        // never silently reused if the new request conflicts with what's
        // already on file, OR if the match itself isn't a genuinely exact
        // name (see isExactCustomerNameMatch above for the "golu" vs "Golu
        // Transport" substring-match regression this closes) — either way,
        // force the user to explicitly choose instead.
        const existing = await getPartyContact(ctx.orgId, party.id);
        if (
          existing &&
          (!isExactCustomerNameMatch(existing.name, draft.partyName) ||
            customerConflictsWithExisting(existing, draft))
        ) {
          proposal.partyId = null;
          proposal.createParty = false;
          proposal.duplicateCandidate = {
            id: existing.id,
            name: existing.name,
            city: existing.city,
            phone: existing.phone,
            whatsapp: existing.whatsapp,
          };
          warn("possibleDuplicateCustomer", { name: existing.name });
        } else {
          proposal.partyId = party.id;
          proposal.createParty = false;
        }
      } else {
        proposal.partyId = null;
        proposal.createParty = party.create;
      }
      if (!draft.partyName) warn("enterCustomerName");

      proposal.plan = buildCustomerPlan(action, false, draft.partyName);
      break;
    }

    // --- Customer Intelligence Sprint: existing-customer workflows -------
    // Every case below resolves an EXISTING customer (never offers
    // "create new" — createParty stays false) and reports the same trio of
    // warnings when the name is missing/unmatched/ambiguous, so the UI
    // behaves identically across edit/view/balance/note/contact/query.

    case "edit_customer": {
      draft.partyName = action.customer_name ?? "";
      proposal.partyType = "customer";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnCustomerResolution(draft.partyName, proposal);

      // Pre-fill from the resolved party's current values so the form shows
      // "what it is now"; any change already present in the command
      // overrides that pre-filled value, ready to review before saving.
      const current = proposal.partyId ? await getPartyContact(ctx.orgId, proposal.partyId) : null;
      draft.newName = action.new_name?.trim() ?? "";
      draft.phone = action.phone ?? current?.phone ?? "";
      draft.whatsapp = action.whatsapp ?? current?.whatsapp ?? "";
      draft.email = action.email ?? current?.email ?? "";
      draft.city = action.city ?? current?.city ?? "";
      draft.note = action.note ?? "";
      draft.postAction = action.post_action ?? "";
      if (
        proposal.partyId &&
        !draft.newName &&
        !action.phone &&
        !action.whatsapp &&
        !action.email &&
        !action.city &&
        !action.note?.trim()
      ) {
        warn("noChangesToSave");
      }

      proposal.plan = buildCustomerPlan(action, true, draft.newName || draft.partyName);
      break;
    }

    case "view_customer": {
      draft.view = action.view;
      draft.periodText = action.period_text ?? "";
      proposal.partyType = "customer";

      if (action.view === "statement") {
        const range = resolvePeriodToRange(action.period_text ?? null);
        draft.dateFrom = range.from ?? "";
        draft.dateTo = range.to ?? "";
      }

      if (action.view === "list") {
        // Generic "search/list customers" — no single party to resolve.
        break;
      }

      draft.partyName = action.customer_name ?? "";
      proposal.needsParty = true;
      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnCustomerResolution(draft.partyName, proposal);
      break;
    }

    case "customer_balance": {
      draft.partyName = action.customer_name ?? "";
      proposal.partyType = "customer";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnCustomerResolution(draft.partyName, proposal);
      break;
    }

    case "add_customer_note": {
      draft.partyName = action.customer_name ?? "";
      draft.note = action.note ?? "";
      proposal.partyType = "customer";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnCustomerResolution(draft.partyName, proposal);
      if (!draft.note.trim()) warn("enterNoteText");
      break;
    }

    case "contact_customer": {
      draft.partyName = action.customer_name ?? "";
      draft.contactMethod = action.method;
      proposal.partyType = "customer";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnCustomerResolution(draft.partyName, proposal);

      if (proposal.partyId) {
        const current = await getPartyContact(ctx.orgId, proposal.partyId);
        draft.phone = current?.phone ?? "";
        draft.whatsapp = current?.whatsapp ?? "";
        draft.email = current?.email ?? "";
        // Never invent contact info — a missing channel is reported so the
        // user can add it first, rather than silently failing at execute.
        if (action.method === "call" && !draft.phone) warn("missingPhone");
        if (action.method === "whatsapp" && !draft.whatsapp) warn("missingWhatsapp");
        if (action.method === "email" && !draft.email) warn("missingEmail");
      }
      break;
    }

    case "customer_query": {
      draft.partyName = action.customer_name ?? "";
      draft.periodText = action.period_text ?? "";
      const range = resolvePeriodToRange(action.period_text ?? null);
      draft.dateFrom = range.from ?? "";
      draft.dateTo = range.to ?? "";
      proposal.partyType = "customer";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnCustomerResolution(draft.partyName, proposal);
      break;
    }

    case "unsupported_customer_action": {
      // Recognized confidently (never "not sure") but genuinely not
      // buildable without new backend/UI — the exact translated message is
      // rendered from this warning code; there is nothing to confirm/save,
      // so the UI hides the confirm button for this action entirely.
      draft.partyName = action.customer_name ?? "";
      draft.requestedAction = action.requested;
      proposal.partyType = "customer";
      warn("notYetAvailable");
      break;
    }

    // --- Supplier & Purchasing Intelligence Sprint ------------------------

    case "create_supplier": {
      // Mirrors create_customer's case exactly (field-for-field), minus the
      // possible-duplicate safety fix — that check was added to
      // create_customer in a dedicated later sprint and hasn't been ported
      // to create_supplier yet; see this file's module doc comment / the
      // parent task's residual-risk notes for tracking. A HIGH-confidence
      // name match still auto-selects the existing supplier (never silently
      // creates a near-duplicate) — only the extra conflicting-details
      // disambiguation prompt is not yet offered here.
      draft.partyName = action.supplier_name ?? "";
      draft.city = action.city ?? "";
      draft.phone = action.phone ?? "";
      draft.whatsapp = action.whatsapp ?? "";
      draft.note = action.note ?? "";
      draft.postAction = action.post_action ?? "";
      proposal.partyType = "supplier";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.id ? false : party.create;
      if (!draft.partyName) warn("enterSupplierName");

      proposal.plan = buildSupplierPlan(action, draft.partyName);
      break;
    }

    // --- Supplier & Purchasing Intelligence Sprint: existing-supplier
    // workflows. Every case below is a field-for-field mirror of the
    // matching customer_* case above (resolveParty(..., "supplier"),
    // createParty always false, warnSupplierResolution instead of
    // warnCustomerResolution) — see the module doc comment at the top of
    // this file's customer block for the shared rationale.

    case "edit_supplier": {
      draft.partyName = action.supplier_name ?? "";
      proposal.partyType = "supplier";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnSupplierResolution(draft.partyName, proposal);

      const current = proposal.partyId ? await getPartyContact(ctx.orgId, proposal.partyId) : null;
      draft.newName = action.new_name?.trim() ?? "";
      draft.phone = action.phone ?? current?.phone ?? "";
      draft.whatsapp = action.whatsapp ?? current?.whatsapp ?? "";
      draft.email = action.email ?? current?.email ?? "";
      draft.city = action.city ?? current?.city ?? "";
      if (
        proposal.partyId &&
        !draft.newName &&
        !action.phone &&
        !action.whatsapp &&
        !action.email &&
        !action.city
      ) {
        warn("noChangesToSave");
      }
      break;
    }

    case "view_supplier": {
      draft.view = action.view;
      proposal.partyType = "supplier";

      if (action.view === "list") {
        // Generic "search/list suppliers" — no single party to resolve.
        break;
      }

      draft.partyName = action.supplier_name ?? "";
      proposal.needsParty = true;
      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnSupplierResolution(draft.partyName, proposal);
      break;
    }

    case "supplier_balance": {
      draft.partyName = action.supplier_name ?? "";
      proposal.partyType = "supplier";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnSupplierResolution(draft.partyName, proposal);
      break;
    }

    case "add_supplier_note": {
      draft.partyName = action.supplier_name ?? "";
      draft.note = action.note ?? "";
      proposal.partyType = "supplier";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnSupplierResolution(draft.partyName, proposal);
      if (!draft.note.trim()) warn("enterNoteText");
      break;
    }

    case "contact_supplier": {
      draft.partyName = action.supplier_name ?? "";
      draft.contactMethod = action.method;
      proposal.partyType = "supplier";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnSupplierResolution(draft.partyName, proposal);

      if (proposal.partyId) {
        const current = await getPartyContact(ctx.orgId, proposal.partyId);
        draft.phone = current?.phone ?? "";
        draft.whatsapp = current?.whatsapp ?? "";
        draft.email = current?.email ?? "";
        // Never invent contact info — a missing channel is reported so the
        // user can add it first, rather than silently failing at execute.
        if (action.method === "call" && !draft.phone) warn("supplierMissingPhone");
        if (action.method === "whatsapp" && !draft.whatsapp) warn("supplierMissingWhatsapp");
        if (action.method === "email" && !draft.email) warn("supplierMissingEmail");
      }
      break;
    }

    case "supplier_query": {
      draft.partyName = action.supplier_name ?? "";
      draft.periodText = action.period_text ?? "";
      const range = resolvePeriodToRange(action.period_text ?? null);
      draft.dateFrom = range.from ?? "";
      draft.dateTo = range.to ?? "";
      proposal.partyType = "supplier";
      proposal.needsParty = true;

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = false;
      warnSupplierResolution(draft.partyName, proposal);
      break;
    }

    case "unsupported_supplier_action": {
      // Recognized confidently (never "not sure") but genuinely not
      // buildable without new backend/UI — mirrors unsupported_customer_action.
      draft.partyName = action.supplier_name ?? "";
      draft.requestedAction = action.requested;
      proposal.partyType = "supplier";
      warn("notYetAvailable");
      break;
    }

    // --- Sales Intelligence Sprint: single-line/lump-sum sales documents,
    // mirroring supplier_purchase (invoice/credit_note) and sales_receipt
    // (refund_receipt's bank + income-account shape) above — see the module
    // doc comment in lib/ai/actions.ts for why these stay single-line only.

    case "sales_invoice": {
      draft.partyName = action.customer_name ?? "";
      draft.amount = numToStr(action.amount);
      draft.description = action.description ?? "";
      draft.date = action.date ?? today();
      draft.dueDate = action.due_date ?? "";
      proposal.partyType = "customer";
      proposal.needsParty = true;
      proposal.needsLineAccount = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.create;
      if (!draft.partyName) warn("chooseCustomerForInvoice");
      if (!draft.amount || Number(draft.amount) <= 0) {
        warn("enterSaleAmount");
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

    case "credit_note": {
      draft.partyName = action.customer_name ?? "";
      draft.amount = numToStr(action.amount);
      draft.description = action.description ?? "";
      draft.date = action.date ?? today();
      proposal.partyType = "customer";
      proposal.needsParty = true;
      proposal.needsLineAccount = true;

      const party = await resolveParty(draft.partyName, "customer");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.create;
      if (!draft.partyName) warn("chooseCustomerForCreditNote");
      if (!draft.amount || Number(draft.amount) <= 0) {
        warn("enterCreditAmount");
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

    case "refund_receipt": {
      // Unlike sales_invoice/credit_note, the customer is OPTIONAL here (a
      // cash refund can be walk-in/anonymous) — createRefundReceipt accepts
      // a nullable partyId, so a missing name is never warned about.
      draft.partyName = action.customer_name ?? "";
      draft.amount = numToStr(action.amount);
      draft.description = action.description ?? "";
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
        warn("enterRefundAmount");
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

    case "view_sales_invoice": {
      // Navigation-only. There is no per-customer sales-invoice filter on
      // /sales-invoices yet (see the salesInvoiceViewTarget doc comment in
      // lib/ai/actions.ts), so — like view_supplier's "list" case — there is
      // no party to resolve here even when a customer name was mentioned.
      draft.view = action.view;
      proposal.partyType = "customer";
      break;
    }

    case "unsupported_sales_action": {
      // Recognized confidently (never "not sure") but genuinely not
      // buildable without new backend/UI — mirrors unsupported_customer_action
      // / unsupported_supplier_action.
      draft.partyName = action.customer_name ?? "";
      draft.requestedAction = action.requested;
      proposal.partyType = "customer";
      warn("notYetAvailable");
      break;
    }
  }

  if (!draft.date) draft.date = today();
  if (lowConfidence) {
    warn("lowConfidence");
  }

  return proposal;
}
