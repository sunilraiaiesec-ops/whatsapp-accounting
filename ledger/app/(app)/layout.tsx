import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { AccountBanners } from "@/components/AccountBanners";
import { getTrialBannerInfo } from "@/lib/billing/subscription";
import { hasPermission } from "@/lib/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const [trialBanner, phoneStatus] = await Promise.all([
    getTrialBannerInfo(ctx.orgId),
    // Scoped query rather than a CurrentContext field — phone verification
    // is a niche, skippable extra that only this banner needs, not worth
    // widening a type used by ~20 call sites (including many test mocks).
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { phoneVerified: true },
    }),
  ]);

  return (
    <AppShell
      orgName={ctx.orgName}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
    >
      <AccountBanners
        emailVerified={ctx.emailVerified}
        email={ctx.userEmail}
        phoneVerified={phoneStatus?.phoneVerified != null}
        trial={
          trialBanner
            ? {
                plan: trialBanner.plan,
                daysLeft: trialBanner.daysLeft,
                expired: trialBanner.expired,
                // Now backed by the real permission matrix
                // (lib/permissions.ts) — only OWNER has manageBilling=true
                // today, so this preserves the exact prior OWNER-only
                // behavior while using the central helper.
                canManageBilling: hasPermission(ctx, "manageBilling"),
              }
            : null
        }
      />
      {children}
    </AppShell>
  );
}
