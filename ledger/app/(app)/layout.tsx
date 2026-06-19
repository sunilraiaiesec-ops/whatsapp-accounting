import { requireContext } from "@/lib/auth/current";
import { getSidebarCounts } from "@/lib/sidebar";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const counts = await getSidebarCounts(ctx.orgId);

  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={ctx.orgName} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-200 bg-white px-6 py-3 print:hidden">
          <div className="text-right">
            <div className="text-sm font-medium text-slate-900">
              {ctx.userName}
            </div>
            <div className="text-xs text-slate-500">
              {ctx.userEmail} · {ctx.baseCurrency}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
