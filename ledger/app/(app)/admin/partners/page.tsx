import { requireContext } from "@/lib/auth/current";
import { isPlatformAdmin } from "@/lib/billing/admin-access";
import { listPartnersWithStats, listCommissionsForAdmin } from "@/lib/billing/partners";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreatePartnerForm } from "@/components/admin/CreatePartnerForm";
import { CommissionStatusForm } from "@/components/admin/CommissionStatusForm";

// See lib/billing/partners.ts#exportCommissionsCsv for why commissions have
// no currency of their own — hardcoded to the platform's own currency here.
const COMMISSION_CURRENCY = "XAF";

// Platform-admin only. Gated by isPlatformAdmin (lib/billing/admin-access.ts)
// — a comma-separated env-var allow-list, not a Membership role, since
// partners/commissions aren't org data and there's no platform-admin
// concept in the schema yet (see that module's header comment).
export default async function AdminPartnersPage() {
  const ctx = await requireContext();

  if (!isPlatformAdmin(ctx.userEmail)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Partners" />
        <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">Not authorized.</div>
      </div>
    );
  }

  const [partners, commissions] = await Promise.all([listPartnersWithStats(), listCommissionsForAdmin()]);
  const money = (minor: bigint) => formatMoney(minor, COMMISSION_CURRENCY);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Partners" subtitle="Referral partners, their referred businesses, and commissions." />

      <section className="card-surface p-4">
        <h2 className="text-sm font-semibold text-slate-700">Add partner</h2>
        <div className="mt-3">
          <CreatePartnerForm />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">All partners</h2>
          <a href="/api/admin/partners/export-csv" className="btn-brand">
            Export commissions CSV
          </a>
        </div>

        {partners.length === 0 ? (
          <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">No partners yet.</div>
        ) : (
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Referral code</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3 text-right">Referred orgs</th>
                    <th className="px-5 py-3 text-right">Lifetime commission</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-900">{p.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.referralCode}</td>
                      <td className="px-5 py-3 text-slate-600">{p.email ?? "—"}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{p.referredOrgCount}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">
                        {money(p.lifetimeCommissionMinorUnits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Commissions</h2>
        {commissions.length === 0 ? (
          <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">No commissions recorded yet.</div>
        ) : (
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-5 py-3">Partner</th>
                    <th className="px-5 py-3">Business</th>
                    <th className="px-5 py-3">Period</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 text-slate-700">{c.partnerName}</td>
                      <td className="px-5 py-3 text-slate-700">{c.orgName}</td>
                      <td className="px-5 py-3 text-slate-600">{c.periodMonth}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">
                        {money(c.amountMinorUnits)}
                      </td>
                      <td className="px-5 py-3">
                        <CommissionStatusForm commissionId={c.id} currentStatus={c.status} />
                      </td>
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
