import type { CurrentContext } from "@/lib/auth/current";
import {
  bankAndCashAccounts,
  paymentCounterpartAccounts,
  receiptCounterpartAccounts,
  receivableAccount,
} from "@/lib/accounts";
import { pickExpenseAccount, pickSalesAccount } from "@/lib/command-accounts";
import { rankInventoryItems, rankParties } from "@/lib/command-match";
import { listInventoryItems } from "@/lib/inventory";
import { listParties } from "@/lib/parties";
import {
  LOW_CONFIDENCE_THRESHOLD,
  type ExtractedAction,
} from "@/lib/ai/actions";
import {
  emptyDraft,
  type BantooOption,
  type BantooProposal,
} from "@/lib/bantoo/types";

function numToStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  const warnings: string[] = [];
  const lowConfidence = action.confidence < LOW_CONFIDENCE_THRESHOLD;

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
    bankAccountId: null,
    bankOptions: [],
    lineAccountId: null,
    lineAccountOptions: [],
    needsItem: false,
    needsParty: false,
    needsBank: false,
    needsLineAccount: false,
  };

  if (action.action === "unknown") {
    return proposal;
  }

  // Shared: resolve a named party (customer/supplier) against the org list.
  async function resolveParty(
    name: string | null | undefined,
    type: "customer" | "supplier",
  ): Promise<{ options: BantooOption[]; id: string | null; create: boolean }> {
    const parties = await listParties(ctx.orgId, type);
    const ranked = name ? rankParties(name, parties) : [];
    const top = ranked[0];
    const id = top && top.score >= 0.85 ? top.id : null;
    const options = ranked.map((p) => ({ id: p.id, label: p.name }));
    const create = Boolean(name && !id && name.trim().length >= 2);
    return { options, id, create };
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
      // Barcode is the strongest signal; fall back to code/name fuzzy match.
      const barcodeDup = draft.barcode
        ? items.find((it) => it.barcode && it.barcode === draft.barcode.trim())
        : undefined;
      const dup = draft.productName
        ? rankInventoryItems(draft.productName, items)[0]
        : undefined;
      if (barcodeDup) {
        warnings.push(
          `“${barcodeDup.name}” already exists with this barcode — receiving stock may be a better fit.`,
        );
      } else if (dup && dup.score >= 0.85) {
        warnings.push(
          `An item like “${dup.name}” already exists — receiving stock may be a better fit.`,
        );
      }
      if (!draft.productName) warnings.push("Enter the product name before saving.");
      // Opening stock is optional; if provided we also receive it, which needs a supplier.
      if (draft.quantity && Number(draft.quantity) > 0) {
        const party = await resolveParty(draft.partyName, "supplier");
        proposal.partyOptions = party.options;
        proposal.partyId = party.id;
        proposal.createParty = party.create;
        if (!draft.costPrice || Number(draft.costPrice) <= 0) {
          warnings.push("Add the unit cost to record opening stock, or clear the quantity.");
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
      proposal.itemOptions = items.map((it) => ({
        id: it.id,
        label: `${it.code} — ${it.name}`,
      }));
      // Prefer an exact barcode hit, then a strong code/name match, before
      // offering to create a new item — this avoids duplicates.
      const barcodeMatch = draft.barcode
        ? items.find((it) => it.barcode && it.barcode === draft.barcode.trim())
        : undefined;
      const rankedItems = draft.productName
        ? rankInventoryItems(draft.productName, items)
        : [];
      const topItem = rankedItems[0];
      proposal.itemId =
        barcodeMatch?.id ?? (topItem && topItem.score >= 0.85 ? topItem.id : null);
      if (!proposal.itemId) {
        warnings.push(
          draft.productName
            ? `“${draft.productName}” isn't in your items yet — pick a match or a new item will be created.`
            : "Choose which inventory item was received.",
        );
      }

      const party = await resolveParty(draft.partyName, "supplier");
      proposal.partyOptions = party.options;
      proposal.partyId = party.id;
      proposal.createParty = party.create;
      if (!draft.partyName) warnings.push("Choose the supplier this stock came from.");
      if (!draft.quantity || Number(draft.quantity) <= 0) {
        warnings.push("Enter the quantity received.");
      }
      if (!draft.costPrice || Number(draft.costPrice) <= 0) {
        warnings.push("Enter the unit cost before saving.");
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
      if (!draft.partyName) warnings.push("Choose the supplier for this bill.");
      if (!draft.amount || Number(draft.amount) <= 0) {
        warnings.push("Enter the invoice total.");
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
        warnings.push("No expense/purchases account found — add one first.");
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
      if (!draft.partyName) warnings.push("Choose the customer who paid.");
      if (!draft.amount || Number(draft.amount) <= 0) {
        warnings.push("Enter the amount received.");
      }

      proposal.bankOptions = await bankOptions();
      proposal.bankAccountId = proposal.bankOptions[0]?.id ?? null;
      if (!proposal.bankAccountId) {
        warnings.push("No bank or cash account found. Add one under Bank & Cash first.");
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
        warnings.push("Enter the amount paid.");
      }

      proposal.bankOptions = await bankOptions();
      proposal.bankAccountId = proposal.bankOptions[0]?.id ?? null;
      if (!proposal.bankAccountId) {
        warnings.push("No bank or cash account found. Add one under Bank & Cash first.");
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
        warnings.push("No expense account found — add one first.");
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
        warnings.push("Enter the sale amount.");
      }

      proposal.bankOptions = await bankOptions();
      proposal.bankAccountId = proposal.bankOptions[0]?.id ?? null;
      if (!proposal.bankAccountId) {
        warnings.push("No bank or cash account found. Add one under Bank & Cash first.");
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
        warnings.push("No income account found — add one first.");
      }
      break;
    }
  }

  if (!draft.date) draft.date = today();
  if (lowConfidence) {
    warnings.unshift("I'm not sure. Please confirm or edit these details.");
  }

  return proposal;
}
