import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import {
  bankAndCashWithBalances,
  receiptCounterpartAccounts,
} from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { createReceiptAction } from "@/app/actions/documents";
import { listClassNames } from "@/lib/documents";
import { CashDocForm } from "@/components/CashDocForm";
import { formatAmount } from "@/lib/money";

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

  const [banks, accounts, parties, classOptions] = await Promise.all([
    bankAndCashWithBalances(ctx.orgId),
    receiptCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId, "customer"),
    listClassNames(ctx.orgId),
  ]);

  const defaultLine =
    accounts.find((a) => a.subtype === "receivable") ??
    accounts.find((a) => a.subtype === "sales") ??
    accounts[0];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/receipts" className="text-sm text-slate-500 hover:text-slate-900">
        ← {tn("receipts")}
      </Link>

      <CashDocForm
        mode="receipt"
        action={createReceiptAction}
        currency={ctx.baseCurrency}
        formTitle={t("newTitle")}
        formSubtitle={t("newSubtitle")}
        bankAccounts={banks.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
          balanceLabel: `${formatAmount(a.balance, ctx.baseCurrency)} ${ctx.baseCurrency}`,
        }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
        defaultLineAccountId={defaultLine?.id ?? ""}
        classOptions={classOptions}
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
