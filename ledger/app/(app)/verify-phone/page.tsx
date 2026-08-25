import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerifyPhoneForm } from "@/components/VerifyPhoneForm";
import { PHONE_RECOVERY_ENABLED } from "@/lib/feature-flags";

export default async function VerifyPhonePage() {
  const ctx = await requireContext();
  const user = PHONE_RECOVERY_ENABLED
    ? await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { phone: true, phoneVerified: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Verify your phone number"
        subtitle="An additional layer of security and a way to recover your account if you ever lose access to your email — this never replaces email sign-in."
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
      <div className="card-surface mt-6 p-6">
        {PHONE_RECOVERY_ENABLED ? (
          <VerifyPhoneForm currentPhone={user?.phone ?? ""} alreadyVerified={user?.phoneVerified != null} />
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Phone verification isn&apos;t available right now — please check back later.
          </p>
        )}
      </div>
    </div>
  );
}
