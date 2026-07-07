import { isDebitNormal } from "@/lib/accounts";
import { allCategories } from "@/lib/migration/categories";
import { categoryTotal, computeTrialBalance } from "@/lib/migration/validation";
import type { WizardState } from "@/lib/migration/types";

export type PreviewLine = {
  accountId: string;
  accountCode: string;
  accountLabel: string;
  debit: bigint;
  credit: bigint;
  partyId?: string | null;
  partyLabel?: string | null;
};

export type PreviewInventoryLine = {
  itemId: string;
  itemLabel: string;
  quantity: string;
  unitCost: bigint;
  totalValue: bigint;
  warehouse: string | null;
};

export type FinishPreview = {
  entryLines: PreviewLine[];
  inventoryLines: PreviewInventoryLine[];
  totalDebit: bigint;
  totalCredit: bigint;
  balanced: boolean;
};

// Step 6 (dry-run preview) AND Step 7 (Finish) share this exact builder, so
// "what you previewed" and "what got posted" can never drift apart — Finish
// re-derives the same lines from the same staged state rather than trusting
// anything the client sent back.
export function buildFinishPreview(state: WizardState): FinishPreview {
  const accountById = new Map(state.accounts.map((a) => [a.id, a]));
  const partyById = new Map([...state.customers, ...state.suppliers].map((p) => [p.id, p]));
  const lines: PreviewLine[] = [];

  const pushPlain = (accountId: string, amount: bigint) => {
    if (amount === 0n) return;
    const account = accountById.get(accountId);
    if (!account) return;
    const debitNormal = isDebitNormal(account.type);
    const debit = debitNormal ? (amount > 0n ? amount : 0n) : amount < 0n ? -amount : 0n;
    const credit = debitNormal ? (amount < 0n ? -amount : 0n) : amount > 0n ? amount : 0n;
    lines.push({ accountId, accountCode: account.code, accountLabel: account.name, debit, credit });
  };

  // Plain balance-sheet categories: one line per account with a nonzero
  // staged balance.
  for (const cat of allCategories()) {
    if (cat.kind !== "plain") continue;
    const accountIds = state.accounts.filter((a) => a.subtype === cat.subtype).map((a) => a.id);
    for (const accountId of accountIds) {
      const row = state.openingBalances.find((r) => r.accountId === accountId);
      if (row) pushPlain(accountId, row.amount);
    }
  }

  // Bank/cash: one Dr line per staged bank account.
  for (const row of state.bankBalances) {
    if (row.amount === 0n) continue;
    const account = accountById.get(row.accountId);
    if (!account) continue;
    lines.push({
      accountId: row.accountId,
      accountCode: account.code,
      accountLabel: account.name,
      debit: row.amount > 0n ? row.amount : 0n,
      credit: row.amount < 0n ? -row.amount : 0n,
    });
  }

  // AR: one Dr line per customer, tagged with partyId (same convention as
  // every other control-account posting in this app — see
  // lib/documents.ts#createReceipt).
  const receivable = state.accounts.find((a) => a.subtype === "receivable" && a.isControl);
  if (receivable) {
    for (const row of state.customerBalances) {
      if (row.amount === 0n) continue;
      lines.push({
        accountId: receivable.id,
        accountCode: receivable.code,
        accountLabel: receivable.name,
        debit: row.amount > 0n ? row.amount : 0n,
        credit: row.amount < 0n ? -row.amount : 0n,
        partyId: row.partyId,
        partyLabel: partyById.get(row.partyId)?.name ?? row.partyId,
      });
    }
  }

  // AP: one Cr line per supplier.
  const payable = state.accounts.find((a) => a.subtype === "payable" && a.isControl);
  if (payable) {
    for (const row of state.supplierBalances) {
      if (row.amount === 0n) continue;
      lines.push({
        accountId: payable.id,
        accountCode: payable.code,
        accountLabel: payable.name,
        debit: row.amount < 0n ? -row.amount : 0n,
        credit: row.amount > 0n ? row.amount : 0n,
        partyId: row.partyId,
        partyLabel: partyById.get(row.partyId)?.name ?? row.partyId,
      });
    }
  }

  // Inventory: ONE aggregate Dr line to the control account (per-item detail
  // lives on InventoryItem.qtyOnHand/valueOnHand, exactly like every other
  // inventory-affecting document in this app — see lib/inventory.ts — since
  // JournalLine has no itemId column).
  const inventoryAccount = state.accounts.find((a) => a.subtype === "inventory" && a.isControl);
  const inventoryCat = allCategories().find((c) => c.key === "inventory")!;
  const inventoryTotal = categoryTotal(inventoryCat, state);
  if (inventoryAccount && inventoryTotal !== 0n) {
    lines.push({
      accountId: inventoryAccount.id,
      accountCode: inventoryAccount.code,
      accountLabel: inventoryAccount.name,
      debit: inventoryTotal > 0n ? inventoryTotal : 0n,
      credit: inventoryTotal < 0n ? -inventoryTotal : 0n,
    });
  }

  const itemById = new Map(state.items.map((i) => [i.id, i]));
  const inventoryLines: PreviewInventoryLine[] = state.inventoryBalances
    .filter((r) => r.totalValue !== 0n || Number(r.quantity || "0") !== 0)
    .map((r) => ({
      itemId: r.itemId,
      itemLabel: itemById.get(r.itemId)?.name ?? r.itemId,
      quantity: r.quantity,
      unitCost: r.unitCost,
      totalValue: r.totalValue,
      warehouse: r.warehouse,
    }));

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0n);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0n);

  return {
    entryLines: lines,
    inventoryLines,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit && computeTrialBalance(state).balanced,
  };
}
