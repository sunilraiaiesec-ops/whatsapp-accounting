import { prisma } from "@/lib/prisma";
import { getEffectiveSubscription } from "@/lib/billing/subscription";
import { getPlanLimits, WARNING_THRESHOLD_RATIO, formatBytes, type PlanId } from "@/lib/billing/plans";
import { getAiCreditStatus } from "@/lib/billing/ai-credits";
import { getStorageUsage } from "@/lib/documents/storage";

// ---------------------------------------------------------------------------
// The single centralized plan/usage enforcement entrypoint. Every server
// action that creates a countable resource calls checkPlanLimit() BEFORE
// writing, and only proceeds when `ok` is true. Nothing here ever blocks
// viewing or exporting existing data — this module has no read-path checks
// at all, only pre-creation ones.
// ---------------------------------------------------------------------------

export type BillingResource =
  | "salesInvoice"
  | "purchaseInvoice"
  | "inventoryItem"
  | "customer"
  | "supplier"
  // No invite flow exists in the app yet (see report) — this resource is
  // wired to the membership count so it's ready the moment one ships.
  | "userInvite"
  | "aiRequest"
  | "documentUpload";

export type PlanCheckResult =
  | { ok: true; warning?: string }
  | { ok: false; message: string; warning?: string };

export type PlanCheckOptions = {
  // For documentUpload: the size (bytes) the new file would add, checked
  // against remaining storage headroom. Ignored by every other resource.
  addBytes?: number;
};

const RESOURCE_LABEL: Record<BillingResource, string> = {
  salesInvoice: "sales invoices this month",
  purchaseInvoice: "purchase invoices this month",
  inventoryItem: "inventory items",
  customer: "customers",
  supplier: "suppliers",
  userInvite: "team members",
  aiRequest: "AI credits this month",
  documentUpload: "storage",
};

function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function countForCountableResource(
  orgId: string,
  resource: Exclude<BillingResource, "aiRequest" | "documentUpload">,
): Promise<number> {
  switch (resource) {
    case "salesInvoice":
      return prisma.salesInvoice.count({ where: { orgId, createdAt: { gte: monthStart() } } });
    case "purchaseInvoice":
      return prisma.purchaseInvoice.count({ where: { orgId, createdAt: { gte: monthStart() } } });
    case "inventoryItem":
      return prisma.inventoryItem.count({ where: { orgId } });
    case "customer":
      return prisma.party.count({ where: { orgId, type: { in: ["customer", "both"] } } });
    case "supplier":
      return prisma.party.count({ where: { orgId, type: { in: ["supplier", "both"] } } });
    case "userInvite":
      return prisma.membership.count({ where: { orgId } });
  }
}

function limitForCountableResource(
  limits: ReturnType<typeof getPlanLimits>,
  resource: Exclude<BillingResource, "aiRequest" | "documentUpload">,
): number | null {
  switch (resource) {
    case "salesInvoice":
    case "purchaseInvoice":
      return limits.maxInvoicesPerMonth;
    case "inventoryItem":
      return limits.maxInventoryItems;
    case "customer":
      return limits.maxCustomers;
    case "supplier":
      return limits.maxSuppliers;
    case "userInvite":
      return limits.maxUsers;
  }
}

function upgradeMessage(plan: PlanId, label: string, limit: number): string {
  const nextPlan = plan === "FREE" ? "Business" : "Enterprise";
  return `You've reached the ${plan} plan's limit of ${limit} ${label}. Upgrade to ${nextPlan} to add more.`;
}

function countableResult(
  plan: PlanId,
  resource: BillingResource,
  count: number,
  limit: number | null,
): PlanCheckResult {
  const label = RESOURCE_LABEL[resource];
  if (limit == null) return { ok: true };

  // `count` is the number that ALREADY exist; creating one more would make
  // it count+1, so we block once count has reached the limit.
  if (count >= limit) {
    return { ok: false, message: upgradeMessage(plan, label, limit) };
  }
  const nextCount = count + 1;
  if (nextCount >= limit * WARNING_THRESHOLD_RATIO) {
    return { ok: true, warning: `You're using ${count} of ${limit} ${label}.` };
  }
  return { ok: true };
}

export async function checkPlanLimit(
  orgId: string,
  resource: BillingResource,
  options: PlanCheckOptions = {},
): Promise<PlanCheckResult> {
  const { effectivePlan } = await getEffectiveSubscription(orgId);
  const limits = getPlanLimits(effectivePlan);

  if (resource === "aiRequest") {
    const status = await getAiCreditStatus(orgId);
    if (status.remaining <= 0) {
      return {
        ok: false,
        message: `You've used all ${status.limit} AI credits included in the ${effectivePlan} plan this month. Renews next month, or upgrade for more.`,
      };
    }
    if (status.used >= status.limit * WARNING_THRESHOLD_RATIO) {
      return { ok: true, warning: `${status.remaining} of ${status.limit} AI credits remaining this month.` };
    }
    return { ok: true };
  }

  if (resource === "documentUpload") {
    const usage = await getStorageUsage(orgId);
    const addBytes = options.addBytes ?? 0;
    const projected = usage.usedBytes + addBytes;
    if (projected > usage.limitBytes) {
      return {
        ok: false,
        message: `This upload would exceed your ${effectivePlan} plan's storage limit of ${formatBytes(usage.limitBytes)} (currently using ${formatBytes(usage.usedBytes)}). Upgrade for more storage.`,
      };
    }
    if (projected >= usage.limitBytes * WARNING_THRESHOLD_RATIO) {
      return {
        ok: true,
        warning: `You're using ${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} storage.`,
      };
    }
    return { ok: true };
  }

  const count = await countForCountableResource(orgId, resource);
  const limit = limitForCountableResource(limits, resource);
  return countableResult(effectivePlan, resource, count, limit);
}
