import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { bankAndCashAccounts, receiptCounterpartAccounts } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { createReceiptAction } from "@/app/actions/documents";
import { CashDocForm } from "@/components/CashDocForm";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string }>;
}) {
  const { partyId } = await searchParams;
  const ctx = await requireContext();
  const t = await getTranslations("receipts");
  const tn = await getTranslations("nav");
  const today = new Date().toISOString().slice(0, 10);

  const [banks, accounts, parties] = await Promise.all([
    bankAndCashAccounts(ctx.orgId),
    receiptCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId, "customer"),
  ]);

  const defaultLine =
    accounts.find((a) => a.subtype === "receivable") ??
    accounts.find((a) => a.subtype === "sales") ??
    accounts[0];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/receipts" className="text-sm text-slate-500 hover:text-slate-900">
        ← {tn("receipts")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
      <p className="text-sm text-slate-500">{t("newSubtitle")}</p>

      <CashDocForm
        mode="receipt"
        action={createReceiptAction}
        currency={ctx.baseCurrency}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
        defaultLineAccountId={defaultLine?.id ?? ""}
        defaults={
          partyId
            ? {
                partyId,
                date: today,
                bankAccountId: "",
                reference: "",
                description: "",
                lines: [],
              }
            : undefined
        }
      />
    </div>
  );
}
