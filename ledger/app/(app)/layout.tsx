import { requireContext } from "@/lib/auth/current";
import { getSidebarCounts } from "@/lib/sidebar";
import { AppShell } from "@/components/AppShell";

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
      baseCurrency={ctx.baseCurrency}
    >
      {children}
    </AppShell>
  );
}
