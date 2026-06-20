import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const t = await getTranslations("import");
  const tn = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">
        ← {tn("settings")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-slate-500">{t("subtitle")}</p>

      <div className="mt-6">
        <ImportWizard />
      </div>
    </div>
  );
}
