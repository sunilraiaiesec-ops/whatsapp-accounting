"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { parseAmount } from "@/lib/money";
import { DocumentError } from "@/lib/documents";
import { LedgerError } from "@/lib/ledger";
import {
  createFixedAsset,
  deleteFixedAsset,
  updateFixedAsset,
  type CreateFixedAssetInput,
} from "@/lib/fixed-assets/assets";
import { postDepreciationPeriod, postDuePeriods } from "@/lib/fixed-assets/depreciation";
import { disposeFixedAsset } from "@/lib/fixed-assets/disposal";
import {
  createDefaultCategories,
  createFixedAssetCategory,
  updateFixedAssetCategory,
  type CreateFixedAssetCategoryInput,
} from "@/lib/fixed-assets/categories";

export type FixedAssetState = { error?: string; info?: string };

function parseDate(value: FormDataEntryValue | null, fallback = new Date()): Date {
  const s = String(value || "").trim();
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function parsePercent(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fail(err: unknown): FixedAssetState {
  if (err instanceof DocumentError || err instanceof LedgerError) {
    return { error: err.message };
  }
  console.error(err);
  return { error: "Could not save. Please try again." };
}

function readAssetInput(formData: FormData, currency: string): CreateFixedAssetInput {
  return {
    name: String(formData.get("name") || ""),
    categoryId: String(formData.get("categoryId") || "") || null,
    partyId: String(formData.get("partyId") || "") || null,
    purchaseDate: parseDate(formData.get("purchaseDate")),
    placedInServiceDate: parseDate(formData.get("placedInServiceDate")),
    purchaseCost: parseAmount(String(formData.get("purchaseCost") || "0"), currency),
    salvageValue: parseAmount(String(formData.get("salvageValue") || "0"), currency),
    usefulLifeMonths: Number(formData.get("usefulLifeMonths") || 0),
    depreciationMethod:
      String(formData.get("depreciationMethod") || "STRAIGHT_LINE") === "DECLINING_BALANCE"
        ? "DECLINING_BALANCE"
        : "STRAIGHT_LINE",
    decliningBalanceRate: parsePercent(formData.get("decliningBalanceRate")),
    fixedAssetAccountId: String(formData.get("fixedAssetAccountId") || ""),
    accumulatedDeprecAccountId: String(formData.get("accumulatedDeprecAccountId") || ""),
    depreciationExpenseAccountId: String(formData.get("depreciationExpenseAccountId") || ""),
    sourceAccountId: String(formData.get("sourceAccountId") || ""),
    reference: String(formData.get("reference") || "") || null,
    notes: String(formData.get("notes") || "") || null,
  };
}

// --- Asset -------------------------------------------------------------------

export async function createFixedAssetAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to add fixed assets." };
  }

  const input = readAssetInput(formData, ctx.baseCurrency);
  if (!input.fixedAssetAccountId || !input.accumulatedDeprecAccountId) {
    return { error: "Choose the fixed asset and accumulated depreciation accounts" };
  }
  if (!input.depreciationExpenseAccountId) {
    return { error: "Choose the depreciation expense account" };
  }
  if (!input.sourceAccountId) {
    return { error: "Choose where the purchase was paid from" };
  }

  let asset;
  try {
    asset = await createFixedAsset(ctx.orgId, input);
  } catch (err) {
    return fail(err);
  }
  redirect(`/fixed-assets/${asset.id}`);
}

export async function updateFixedAssetAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to edit fixed assets." };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing asset id" };
  const input = readAssetInput(formData, ctx.baseCurrency);

  try {
    await updateFixedAsset(ctx.orgId, id, input);
  } catch (err) {
    return fail(err);
  }
  redirect(`/fixed-assets/${id}`);
}

export async function deleteFixedAssetAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to delete fixed assets." };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing asset id" };

  try {
    await deleteFixedAsset(ctx.orgId, id);
  } catch (err) {
    return fail(err);
  }
  redirect("/fixed-assets");
}

// --- Depreciation --------------------------------------------------------------

export async function postDepreciationPeriodAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to post depreciation." };
  }

  const scheduleId = String(formData.get("scheduleId") || "");
  const assetId = String(formData.get("assetId") || "");
  if (!scheduleId || !assetId) return { error: "Missing period id" };

  try {
    await postDepreciationPeriod(ctx.orgId, scheduleId);
  } catch (err) {
    return fail(err);
  }
  redirect(`/fixed-assets/${assetId}/depreciation`);
}

export async function postDuePeriodsAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to post depreciation." };
  }

  const assetId = String(formData.get("assetId") || "") || undefined;

  let result;
  try {
    result = await postDuePeriods(ctx.orgId, { assetId });
  } catch (err) {
    return fail(err);
  }

  if (assetId) redirect(`/fixed-assets/${assetId}/depreciation`);
  return {
    info: `Posted ${result.posted.length} period(s). ${result.skipped.length} skipped, ${result.errors.length} failed.`,
  };
}

// --- Disposal -----------------------------------------------------------------

export async function disposeFixedAssetAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to dispose of fixed assets." };
  }

  const assetId = String(formData.get("assetId") || "");
  if (!assetId) return { error: "Missing asset id" };

  const proceeds = parseAmount(String(formData.get("proceeds") || "0"), ctx.baseCurrency);
  const receivingAccountId = String(formData.get("receivingAccountId") || "") || null;

  try {
    await disposeFixedAsset(ctx.orgId, assetId, {
      date: parseDate(formData.get("date")),
      proceeds,
      receivingAccountId,
      notes: String(formData.get("notes") || "") || null,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/fixed-assets/${assetId}`);
}

// --- Categories ----------------------------------------------------------------

function readCategoryInput(formData: FormData): CreateFixedAssetCategoryInput {
  return {
    name: String(formData.get("name") || ""),
    fixedAssetAccountId: String(formData.get("fixedAssetAccountId") || ""),
    accumulatedDeprecAccountId: String(formData.get("accumulatedDeprecAccountId") || ""),
    depreciationExpenseAccountId: String(formData.get("depreciationExpenseAccountId") || ""),
    usefulLifeMonths: Number(formData.get("usefulLifeMonths") || 0),
    depreciationMethod:
      String(formData.get("depreciationMethod") || "STRAIGHT_LINE") === "DECLINING_BALANCE"
        ? "DECLINING_BALANCE"
        : "STRAIGHT_LINE",
    decliningBalanceRate: parsePercent(formData.get("decliningBalanceRate")),
  };
}

export async function createFixedAssetCategoryAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to manage asset categories." };
  }

  try {
    await createFixedAssetCategory(ctx.orgId, readCategoryInput(formData));
  } catch (err) {
    return fail(err);
  }
  redirect("/fixed-assets/categories");
}

export async function updateFixedAssetCategoryAction(
  _prev: FixedAssetState,
  formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to manage asset categories." };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing category id" };

  try {
    await updateFixedAssetCategory(ctx.orgId, id, readCategoryInput(formData));
  } catch (err) {
    return fail(err);
  }
  redirect("/fixed-assets/categories");
}

export async function createDefaultCategoriesAction(
  _prev: FixedAssetState,
  _formData: FormData,
): Promise<FixedAssetState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "manageFixedAssets")) {
    return { error: "You don't have permission to manage asset categories." };
  }

  const created = await createDefaultCategories(ctx.orgId);
  return created > 0
    ? { info: `Added ${created} category${created === 1 ? "" : "ies"}.` }
    : { info: "Those categories already exist." };
}
