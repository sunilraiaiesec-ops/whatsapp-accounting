import { getCurrentContext } from "@/lib/auth/current";
import { isPlatformAdmin } from "@/lib/billing/admin-access";
import { getCommercialStats } from "@/lib/billing/admin-stats";
import { formatBytes } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminSetPlanForm } from "./AdminSetPlanForm";

// ---------------------------------------------------------------------------
// Internal commercial admin dashboard — platform-admin only (see
// lib/billing/admin-access.ts). Plain hardcoded English strings, no
// next-intl. Renders "Not authorized" for anyone else rather than crashing
// or redirect-looping, since this sits inside the normal (app) layout (any
// logged-in user can navigate to the URL).
// ---------------------------------------------------------------------------

const RECENT_ORGS_LIMIT = 50;

export default async function CommercialAdminPage() {
  const ctx = await getCurrentContext();
  if (!ctx || !isPlatformAdmin(ctx.userEmail)) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card-surface p-6 text-center">
          <p className="text-sm font-medium text-slate-700">Not authorized.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            This page is restricted to platform admins.
          </p>
        </div>
      </div>
    );
  }

  const [stats, orgs] = await Promise.all([
    getCommercialStats(),
    prisma.organization.findMany({
      take: RECENT_ORGS_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Commercial dashboard" subtitle="Platform-wide billing & usage overview" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total signups" value={stats.totalSignups} />
        <StatCard label="Active trials" value={stats.activeTrials} />
        <StatCard label="Active paid orgs" value={stats.activePaidOrgs} />
        <StatCard label="Free / churned orgs" value={stats.freeOrgs} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-4">
          <h2 className="text-sm font-semibold text-slate-700">Plan distribution</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {stats.planDistribution.map((row) => (
              <li key={row.plan} className="flex items-center justify-between">
                <span className="text-slate-600">{row.plan}</span>
                <span className="font-semibold text-slate-900">{row.count}</span>
              </li>
            ))}
            {stats.planDistribution.length === 0 ? (
              <li className="text-[var(--muted)]">No subscriptions yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="card-surface p-4">
          <h2 className="text-sm font-semibold text-slate-700">Usage this month ({stats.aiUsageYearMonth})</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">AI credits used (all orgs)</dt>
            <dd className="text-right font-semibold text-slate-900">{stats.aiCreditsUsedThisMonth}</dd>
            <dt className="text-slate-500">Storage used (all orgs)</dt>
            <dd className="text-right font-semibold text-slate-900">{formatBytes(stats.totalStorageBytes)}</dd>
          </dl>
        </section>

        <section className="card-surface p-4">
          <h2 className="text-sm font-semibold text-slate-700">Partner referrals</h2>
          <p className="mt-2 text-sm text-slate-600">
            Total referrals: <span className="font-semibold text-slate-900">{stats.totalReferrals}</span>
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {stats.topPartners.map((p) => (
              <li key={p.partnerId} className="flex items-center justify-between">
                <span className="text-slate-600">{p.partnerName}</span>
                <span className="font-semibold text-slate-900">{p.referralCount}</span>
              </li>
            ))}
            {stats.topPartners.length === 0 ? (
              <li className="text-[var(--muted)]">No referrals yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="card-surface p-4">
          <h2 className="text-sm font-semibold text-slate-700">Set an org&apos;s plan manually</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Uses the manual payment provider directly — the working default until a real payment
            provider is wired up (see lib/billing/provider.ts).
          </p>
          <div className="mt-3">
            <AdminSetPlanForm />
          </div>
        </section>
      </div>

      <section className="card-surface mt-6 overflow-x-auto p-4">
        <h2 className="text-sm font-semibold text-slate-700">Recent organizations</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
              <th className="pb-2 pr-3 font-medium">Org ID</th>
              <th className="pb-2 pr-3 font-medium">Name</th>
              <th className="pb-2 pr-3 font-medium">Plan</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium">Period end</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{org.id}</td>
                <td className="py-2 pr-3 text-slate-900">{org.name}</td>
                <td className="py-2 pr-3 text-slate-600">{org.subscription?.plan ?? "—"}</td>
                <td className="py-2 pr-3 text-slate-600">{org.subscription?.status ?? "—"}</td>
                <td className="py-2 text-slate-600">
                  {org.subscription?.currentPeriodEnd
                    ? new Date(org.subscription.currentPeriodEnd).toLocaleDateString("en-US")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
