import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/auth/current";
import { getPartnerDashboardData } from "@/lib/billing/partners";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";

// Commission amounts have no currency of their own (see
// lib/billing/partners.ts#exportCommissionsCsv) — the platform commission
// ledger is denominated in the platform's own currency, not each referred
// org's baseCurrency, so it's hardcoded here rather than read from ctx.
const COMMISSION_CURRENCY = "XAF";

// Assumption (no dedicated partner-login system exists yet): the current
// logged-in user is treated as "the partner" if a Partner row exists with
// userId === ctx.userId, or (fallback, for partners who signed up as a
// normal BantooBooks customer under the same email but were never formally
// linked via userId) email === ctx.userEmail, case-insensitively. If neither
// matches, this renders a plain "no partner account" message instead of
// redirecting or crashing — being a partner is optional and orthogonal to
// having a BantooBooks login at all.
export default async function PartnerDashboardPage() {
  const ctx = await requireContext();

  const partner = await prisma.partner.findFirst({
    where: {
      OR: [{ userId: ctx.userId }, { email: { equals: ctx.userEmail, mode: "insensitive" } }],
    },
    select: { id: true },
  });

  if (!partner) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Partner dashboard" />
        <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">
          You don&apos;t have a partner account. If you believe this is a mistake, contact BantooBooks support.
        </div>
      </div>
    );
  }

  const data = await getPartnerDashboardData(partner.id);
  const money = (minor: bigint) => formatMoney(minor, COMMISSION_CURRENCY);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Partner dashboard"
        subtitle={`Referral code: ${data.partner.referralCode}`}
      />

      <StatGrid>
        <StatCard icon="users" tone="emerald" label="Referred businesses" value={String(data.referredBusinesses.length)} />
        <StatCard icon="count" tone="blue" label="Active paid subscriptions" value={String(data.activeSubscriptionCount)} />
        <StatCard icon="sum" tone="amber" label="This month's commission" value={money(data.thisMonthCommissionMinorUnits)} />
        <StatCard icon="wallet" tone="violet" label="Lifetime commission" value={money(data.lifetimeCommissionMinorUnits)} />
      </StatGrid>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Paid to date: {money(data.paidToDateMinorUnits)}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Referred businesses</h2>
        {data.referredBusinesses.length === 0 ? (
          <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">
            No referred businesses yet. Share your referral link to get started.
          </div>
        ) : (
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3">Business</th>
                    <th className="px-5 py-3">Signed up</th>
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referredBusinesses.map((b) => (
                    <tr key={b.orgId} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-900">{b.orgName}</td>
                      <td className="px-5 py-3 text-slate-600">{b.signupDate.toISOString().slice(0, 10)}</td>
                      <td className="px-5 py-3 text-slate-600">{b.plan ?? "—"}</td>
                      <td className="px-5 py-3 text-slate-600">{b.subscriptionStatus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Payout history</h2>
        {data.payoutHistory.length === 0 ? (
          <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">
            No commissions recorded yet.
          </div>
        ) : (
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3">Period</th>
                    <th className="px-5 py-3">Business</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payoutHistory.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 text-slate-700">{p.periodMonth}</td>
                      <td className="px-5 py-3 text-slate-700">{p.orgName}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">
                        {money(p.amountMinorUnits)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
