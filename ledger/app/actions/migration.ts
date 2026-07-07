"use server";

import { revalidatePath } from "next/cache";

import { requireContext } from "@/lib/auth/current";
import {
  MigrationError,
  addBankAccount,
  isAdminRole,
  loadWizardState,
  removeInventoryBalance,
  setCurrentStep,
  setOpeningDate,
  toClientState,
  upsertBankBalance,
  upsertCustomerBalance,
  upsertInventoryBalance,
  upsertOpeningBalance,
  upsertSupplierBalance,
  acknowledgeWarning,
  unacknowledgeWarning,
} from "@/lib/migration/wizard";
import { explainImbalance, applyBalancingSuggestion, type ImbalanceExplanation } from "@/lib/migration/suggestions";
import { computeHealthScore, type HealthScoreResult } from "@/lib/migration/health-score";
import { computeConsistencyWarnings, type ConsistencyWarning } from "@/lib/migration/consistency";
import { computeTrialBalance, type TrialBalanceResult } from "@/lib/migration/validation";
import { buildFinishPreview, type FinishPreview } from "@/lib/migration/preview";
import { finishMigration, FinishBlockedError } from "@/lib/migration/finish";
import { askWizardAssistant } from "@/lib/ai/wizard-assistant";
import { getImportSource, type MigrationEntityKind } from "@/lib/migration/import-sources";
import { prisma } from "@/lib/prisma";
import type { ClientWizardState } from "@/lib/migration/types";

export type MigrationActionState = {
  state?: ClientWizardState;
  error?: string;
};

async function ctxAndState(): Promise<{
  orgId: string;
  userId: string;
  isAdmin: boolean;
  currency: string;
}> {
  const ctx = await requireContext();
  return { orgId: ctx.orgId, userId: ctx.userId, isAdmin: isAdminRole(ctx.role), currency: ctx.baseCurrency };
}

async function freshState(): Promise<ClientWizardState> {
  const { orgId, isAdmin, currency } = await ctxAndState();
  const state = await loadWizardState(orgId);
  return toClientState(state, currency, isAdmin);
}

function fail(err: unknown): MigrationActionState {
  if (err instanceof MigrationError) return { error: err.message };
  console.error("[migration]", err);
  return { error: "Something went wrong. Please try again." };
}

async function withState(fn: (orgId: string, currency: string) => Promise<void>): Promise<MigrationActionState> {
  try {
    const { orgId, currency } = await ctxAndState();
    await fn(orgId, currency);
    revalidatePath("/migration");
    return { state: await freshState() };
  } catch (err) {
    return fail(err);
  }
}

export async function loadMigrationWizardAction(): Promise<MigrationActionState> {
  try {
    return { state: await freshState() };
  } catch (err) {
    return fail(err);
  }
}

export async function setStepAction(step: number): Promise<MigrationActionState> {
  return withState((orgId) => setCurrentStep(orgId, step));
}

export async function setOpeningDateAction(isoDate: string): Promise<MigrationActionState> {
  return withState((orgId) => setOpeningDate(orgId, isoDate));
}

export async function saveOpeningBalanceAction(
  accountId: string,
  amountText: string,
): Promise<MigrationActionState> {
  return withState((orgId, currency) => upsertOpeningBalance(orgId, accountId, amountText, currency));
}

export async function addBankAccountAction(
  name: string,
  subtype: "bank" | "cash",
  currency: string | null,
): Promise<MigrationActionState> {
  return withState((orgId) => addBankAccount(orgId, { name, subtype, currency }).then(() => undefined));
}

export async function saveBankBalanceAction(
  accountId: string,
  amountText: string,
): Promise<MigrationActionState> {
  return withState((orgId, currency) => upsertBankBalance(orgId, accountId, amountText, currency));
}

export async function saveCustomerBalanceAction(
  partyId: string,
  amountText: string,
): Promise<MigrationActionState> {
  return withState((orgId, currency) => upsertCustomerBalance(orgId, partyId, amountText, currency));
}

export async function saveSupplierBalanceAction(
  partyId: string,
  amountText: string,
): Promise<MigrationActionState> {
  return withState((orgId, currency) => upsertSupplierBalance(orgId, partyId, amountText, currency));
}

export async function saveInventoryBalanceAction(
  itemId: string,
  quantity: string,
  unit: string,
  unitCost: string,
  warehouse: string,
): Promise<MigrationActionState> {
  return withState((orgId, currency) =>
    upsertInventoryBalance(orgId, itemId, { quantity, unit, unitCost, warehouse }, currency).then(() => undefined),
  );
}

export async function removeInventoryBalanceAction(itemId: string): Promise<MigrationActionState> {
  return withState((orgId) => removeInventoryBalance(orgId, itemId));
}

export async function acknowledgeWarningAction(code: string): Promise<MigrationActionState> {
  return withState((orgId) => acknowledgeWarning(orgId, code));
}

export async function unacknowledgeWarningAction(code: string): Promise<MigrationActionState> {
  return withState((orgId) => unacknowledgeWarning(orgId, code));
}

export async function applySuggestionAction(
  actionId: "allocate_opening_equity" | "allocate_retained_earnings",
): Promise<MigrationActionState> {
  try {
    const { orgId } = await ctxAndState();
    const state = await loadWizardState(orgId);
    await applyBalancingSuggestion(orgId, actionId, state);
    revalidatePath("/migration");
    return { state: await freshState() };
  } catch (err) {
    return fail(err);
  }
}

export type ValidationSnapshot = {
  trialBalance: TrialBalanceResult;
  warnings: ConsistencyWarning[];
  healthScore: HealthScoreResult;
  preview: FinishPreview;
};

export async function getValidationSnapshotAction(): Promise<
  { snapshot: ValidationSnapshot; currency: string } | { error: string }
> {
  try {
    const { orgId, currency } = await ctxAndState();
    const state = await loadWizardState(orgId);
    return {
      snapshot: {
        trialBalance: computeTrialBalance(state),
        warnings: computeConsistencyWarnings(state),
        healthScore: computeHealthScore(state),
        preview: buildFinishPreview(state),
      },
      currency,
    };
  } catch (err) {
    console.error("[migration/validation]", err);
    return { error: "Could not compute validation." };
  }
}

export async function explainImbalanceAction(): Promise<
  { explanation: ImbalanceExplanation } | { error: string }
> {
  try {
    const { orgId, currency } = await ctxAndState();
    const state = await loadWizardState(orgId);
    return { explanation: await explainImbalance(state, currency) };
  } catch (err) {
    console.error("[migration/explain]", err);
    return { error: "Could not compute an explanation." };
  }
}

export async function askWizardAssistantAction(
  question: string,
): Promise<{ answer: string; source: "ai" | "rule_based" } | { error: string }> {
  try {
    const { orgId, currency } = await ctxAndState();
    const state = await loadWizardState(orgId);
    const tb = computeTrialBalance(state);
    const result = await askWizardAssistant(question, {
      orgId,
      currentStep: state.wizard.currentStep,
      currency,
      totalAssets: tb.totalAssets,
      totalLiabilities: tb.totalLiabilities,
      totalEquity: tb.totalEquity,
      difference: tb.difference,
      zeroOrMissingCategories: tb.categories.filter((c) => c.amount === 0n).map((c) => c.label),
    });
    return result;
  } catch (err) {
    console.error("[migration/ask]", err);
    return { error: "Could not answer that right now." };
  }
}

export async function importMasterDataAction(
  formData: FormData,
): Promise<MigrationActionState & { imported?: number; skipped?: number; errors?: string[] }> {
  try {
    const { orgId, currency } = await ctxAndState();
    const entityKind = String(formData.get("entityKind") || "") as MigrationEntityKind;
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "Choose a file first." };
    const source = getImportSource("csv");
    if (!source) return { error: "No import source available." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await source.execute(orgId, entityKind, { buffer, fileName: file.name }, currency);

    const wizard = await prisma.migrationWizard.findUnique({ where: { orgId }, select: { id: true } });
    if (wizard) {
      await prisma.migrationImportRun.create({
        data: {
          wizardId: wizard.id,
          sourceKind: source.kind,
          entityKind,
          fileName: file.name,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors,
        },
      });
    }

    revalidatePath("/migration");
    return { state: await freshState(), imported: result.imported, skipped: result.skipped, errors: result.errors };
  } catch (err) {
    return fail(err);
  }
}

// Admin-only. Lets an administrator start the wizard over from Step 1 after
// it has already been completed — e.g. to correct a mistake. This clears
// every staged row and resets status/currentStep, but deliberately does NOT
// reverse the journal entry the previous Finish already posted (that is a
// normal, permanent ledger entry like any other document in this app — an
// admin who needs to undo it should post a reversing/adjusting entry the
// same way they would for any other mis-posted document). See the report's
// assumptions section for more on this trade-off.
export async function rerunMigrationWizardAction(): Promise<MigrationActionState> {
  try {
    const { orgId, isAdmin } = await ctxAndState();
    if (!isAdmin) return { error: "Only an administrator can rerun a completed migration." };
    const wizard = await prisma.migrationWizard.findUnique({ where: { orgId } });
    if (!wizard) return { error: "No migration to rerun." };

    await prisma.$transaction([
      prisma.migrationOpeningBalance.deleteMany({ where: { wizardId: wizard.id } }),
      prisma.migrationBankBalance.deleteMany({ where: { wizardId: wizard.id } }),
      prisma.migrationCustomerBalance.deleteMany({ where: { wizardId: wizard.id } }),
      prisma.migrationSupplierBalance.deleteMany({ where: { wizardId: wizard.id } }),
      prisma.migrationInventoryBalance.deleteMany({ where: { wizardId: wizard.id } }),
      prisma.migrationAcknowledgedWarning.deleteMany({ where: { wizardId: wizard.id } }),
      prisma.migrationWizard.update({
        where: { id: wizard.id },
        data: { status: "IN_PROGRESS", currentStep: 1, completedAt: null, completedById: null },
      }),
    ]);

    revalidatePath("/migration");
    return { state: await freshState() };
  } catch (err) {
    return fail(err);
  }
}

export async function finishMigrationAction(): Promise<MigrationActionState> {
  try {
    const { orgId, userId, isAdmin } = await ctxAndState();
    const state = await loadWizardState(orgId);
    await finishMigration(orgId, userId, isAdmin, state);
    revalidatePath("/migration");
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { state: await freshState() };
  } catch (err) {
    if (err instanceof FinishBlockedError) return { error: err.message };
    return fail(err);
  }
}
