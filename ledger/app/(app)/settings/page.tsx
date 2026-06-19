import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";

export default async function SettingsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("settings");

  return (
    <div className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <div className="mt-6 space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
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

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("accounting")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/accounts" className="text-slate-900 underline">
                {t("chartOfAccounts")}
              </Link>
            </li>
            <li>
              <Link href="/journal/new" className="text-slate-900 underline">
                {t("manualJournal")}
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
