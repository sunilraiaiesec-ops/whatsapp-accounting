import Link from "next/link";

import { requireContext } from "@/lib/auth/current";

export default async function SettingsPage() {
  const ctx = await requireContext();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-slate-500">Organization configuration.</p>

      <div className="mt-6 space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Business</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-900">{ctx.orgName}</dd>
            <dt className="text-slate-500">Base currency</dt>
            <dd className="text-slate-900">{ctx.baseCurrency}</dd>
            <dt className="text-slate-500">Your role</dt>
            <dd className="text-slate-900 capitalize">{ctx.role.toLowerCase()}</dd>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Accounting</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/accounts" className="text-slate-900 underline">
                Chart of Accounts
              </Link>
            </li>
            <li>
              <Link href="/journal/new" className="text-slate-900 underline">
                Post a manual journal entry
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
