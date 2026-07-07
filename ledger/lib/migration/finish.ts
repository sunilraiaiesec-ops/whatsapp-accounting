import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, LedgerError } from "@/lib/ledger";
import { MigrationError } from "@/lib/migration/wizard";
import { computeTrialBalance } from "@/lib/migration/validation";
import { unacknowledgedWarnings } from "@/lib/migration/consistency";
import { buildFinishPreview } from "@/lib/migration/preview";
import type { WizardState } from "@/lib/migration/types";

export class FinishBlockedError extends MigrationError {}

export type FinishResult = {
  journalEntryId: string | null;
  inventoryItemsUpdated: number;
};

// Step 7 — the ONLY place in this feature that ever writes to the real
// ledger. Everything upstream (Steps 1-6) only ever touched the
// MigrationWizard staging tables. This function:
//   1. Re-validates from scratch (never trusts client-computed numbers).
//   2. Does everything inside ONE Prisma transaction — on any failure,
//      Prisma rolls the whole thing back, so a half-posted migration can
//      never exist.
//   3. Posts through the SAME posting primitive (postEntryWithin) the rest
//      of the app's documents use, and updates InventoryItem the same way
//      lib/inventory.ts does for every other inventory-affecting document.
export async function finishMigration(
  orgId: string,
  actingUserId: string,
  isAdmin: boolean,
  state: WizardState,
): Promise<FinishResult> {
  if (!isAdmin) {
    throw new FinishBlockedError("Only an administrator can complete the migration.");
  }
  if (state.wizard.status === "completed") {
    throw new FinishBlockedError("This migration has already been completed.");
  }
  if (!state.wizard.openingDate) {
    throw new FinishBlockedError("Set the migration date in Step 1 first.");
  }

  const trialBalance = computeTrialBalance(state);
  if (!trialBalance.balanced) {
    throw new FinishBlockedError(
      `The staged trial balance is not zero yet (difference ${trialBalance.difference}). Finish is blocked until Assets = Liabilities + Equity.`,
    );
  }
  const outstanding = unacknowledgedWarnings(state);
  if (outstanding.length > 0) {
    throw new FinishBlockedError(
      `Resolve or acknowledge ${outstanding.length} outstanding warning(s) in Step 5 before finishing.`,
    );
  }

  const preview = buildFinishPreview(state);
  if (!preview.balanced) {
    // Defensive — buildFinishPreview derives from the same trial balance, so
    // this should be unreachable, but never post an unbalanced entry.
    throw new FinishBlockedError("Internal error: the computed opening entry does not balance.");
  }

  const openingDate = new Date(`${state.wizard.openingDate}T00:00:00.000Z`);

  const result = await prisma.$transaction(async (tx) => {
    let journalEntryId: string | null = null;

    if (preview.entryLines.length > 0) {
      const entry = await postEntryWithin(tx, {
        orgId,
        entryDate: openingDate,
        description: "Opening balances (Migration Wizard)",
        sourceType: "migration_opening_balance",
        lines: preview.entryLines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          partyId: l.partyId ?? null,
          memo: l.partyLabel ? `Opening balance — ${l.partyLabel}` : null,
        })),
      });
      journalEntryId = entry.id;
    }

    let inventoryItemsUpdated = 0;
    for (const line of preview.inventoryLines) {
      const qty = new Prisma.Decimal(line.quantity || "0");
      await tx.inventoryItem.update({
        where: { id: line.itemId },
        data: {
          qtyOnHand: { increment: qty },
          valueOnHand: { increment: line.totalValue },
        },
      });
      inventoryItemsUpdated += 1;
    }

    await tx.migrationWizard.update({
      where: { id: state.wizard.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: actingUserId,
      },
    });

    return { journalEntryId, inventoryItemsUpdated };
  });

  return result;
}

export { LedgerError };
