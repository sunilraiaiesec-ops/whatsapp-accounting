import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { getResetStatus } from "@/lib/org-reset";
import { ResetBooksPanel } from "@/components/ResetBooksPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function SettingsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("settings");
  const isOwner = ctx.role === "OWNER";
  const resetStatus = isOwner ? await getResetStatus(ctx.orgId) : { step: "none" as const };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mt-6 space-y-4">
        <section className="card-surface p-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("business")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">{t("name")}</dt>
            <dd className="text-slate-900">{ctx.orgName}</dd>
            <dt className="text-slate-500">{t("baseCurrency")}</dt>
            <dd className="text-slate-900">{ctx.baseCurrency}</dd>
            <dt className="text-slate-500">{t("role")}</dt>
            <dd className="text-slate-900 capitalize">{ctx.role.toLowerCase()}</dd>
          </dl>
        </section>

        <section className="card-surface p-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("accounting")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/accounts" className="font-medium text-[var(--brand)] hover:underline">
                {t("chartOfAccounts")}
              </Link>
            </li>
            <li>
              <Link href="/journal/new" className="font-medium text-[var(--brand)] hover:underline">
                {t("manualJournal")}
              </Link>
            </li>
            <li>
              <Link href="/import" className="font-medium text-[var(--brand)] hover:underline">
                {t("importData")}
              </Link>
            </li>
          </ul>
        </section>

        {isOwner ? (
          <ResetBooksPanel orgName={ctx.orgName} status={resetStatus} />
        ) : (
          <section className="rounded-xl border border-[var(--border)] bg-slate-50 p-4">
            <p className="text-sm text-slate-600">{t("resetOwnerOnly")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
