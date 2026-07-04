import { requireContext } from "@/lib/auth/current";
import { getSidebarCounts } from "@/lib/sidebar";
import { AppShell } from "@/components/AppShell";
import { EmailVerifyBanner } from "@/components/EmailVerifyBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const counts = await getSidebarCounts(ctx.orgId);

  return (
    <AppShell
      orgName={ctx.orgName}
      counts={counts}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
    >
      <EmailVerifyBanner verified={ctx.emailVerified} email={ctx.userEmail} />
      {children}
    </AppShell>
  );
}
