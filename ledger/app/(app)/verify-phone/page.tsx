import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerifyPhoneForm } from "@/components/VerifyPhoneForm";

export default async function VerifyPhonePage() {
  const ctx = await requireContext();
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { phone: true, phoneVerified: true },
  });

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Verify your phone number"
        subtitle="An additional layer of security and a way to recover your account if you ever lose access to your email — this never replaces email sign-in."
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
      <div className="card-surface mt-6 p-6">
        <VerifyPhoneForm currentPhone={user?.phone ?? ""} alreadyVerified={user?.phoneVerified != null} />
      </div>
    </div>
  );
}
