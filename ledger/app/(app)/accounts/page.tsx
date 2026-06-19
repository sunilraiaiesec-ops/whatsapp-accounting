import { requireContext } from "@/lib/auth/current";
import { listAccounts } from "@/lib/accounts";

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};
const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export default async function AccountsPage() {
  const ctx = await requireContext();
  const accounts = await listAccounts(ctx.orgId);

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    rows: accounts.filter((a) => a.type === type),
  })).filter((g) => g.rows.length > 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
      <p className="text-sm text-slate-500">
        The accounts every transaction posts to. Control accounts back the
        customer, supplier and inventory subledgers.
      </p>

      <div className="mt-6 space-y-6">
        {grouped.map((group) => (
          <section
            key={group.type}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {group.label}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {group.rows.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="w-20 px-4 py-2 font-mono text-slate-500">
                      {a.code}
                    </td>
                    <td className="px-4 py-2 text-slate-900">{a.name}</td>
                    <td className="px-4 py-2 text-right">
                      {a.isControl ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          control
                        </span>
                      ) : null}
                      {a.subtype ? (
                        <span className="ml-2 text-xs text-slate-400">
                          {a.subtype}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
