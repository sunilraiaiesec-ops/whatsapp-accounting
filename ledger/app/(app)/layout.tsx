import { requireContext } from "@/lib/auth/current";
import { AppShell } from "@/components/AppShell";
import { EmailVerifyBanner } from "@/components/EmailVerifyBanner";
import { TrialBanner } from "@/components/TrialBanner";
import { getTrialBannerInfo } from "@/lib/billing/subscription";
import { hasPermission } from "@/lib/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const trialBanner = await getTrialBannerInfo(ctx.orgId);

  return (
    <AppShell
      orgName={ctx.orgName}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
    >
      <EmailVerifyBanner verified={ctx.emailVerified} email={ctx.userEmail} />
      {trialBanner ? (
        <TrialBanner
          plan={trialBanner.plan}
          daysLeft={trialBanner.daysLeft}
          expired={trialBanner.expired}
          // Now backed by the real permission matrix (lib/permissions.ts) —
          // only OWNER has manageBilling=true today, so this preserves the
          // exact prior OWNER-only behavior while using the central helper.
          canManageBilling={hasPermission(ctx, "manageBilling")}
        />
      ) : null}
      {children}
    </AppShell>
  );
}
