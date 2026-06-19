import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PasswordForm, ProfileDetailsForm } from "@/components/ProfileForms";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ProfilePage() {
  const ctx = await requireContext();
  const t = await getTranslations("profile");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { name: true, email: true, phone: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <section className="card-surface p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          {t("language")}
        </div>
        <LanguageSwitcher variant="menu" />
      </section>

      <ProfileDetailsForm name={user.name} email={user.email} phone={user.phone} />
      <PasswordForm />
    </div>
  );
}
