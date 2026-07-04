import { getTranslations } from "next-intl/server";

import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ImportPage() {
  const t = await getTranslations("import");
  const tn = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        backHref="/settings"
        backLabel={tn("settings")}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div className="mt-6">
        <ImportWizard />
      </div>
    </div>
  );
}
