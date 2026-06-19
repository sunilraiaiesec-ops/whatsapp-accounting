import { requireContext } from "@/lib/auth/current";
import { listParties } from "@/lib/parties";
import { PartyCreateForm } from "@/components/PartyCreateForm";

export default async function SuppliersPage() {
  const ctx = await requireContext();
  const suppliers = await listParties(ctx.orgId, "supplier");

  return (
    <div>
      <h1 className="text-2xl font-semibold">Suppliers</h1>
      <p className="text-sm text-slate-500">
        Suppliers back the accounts payable subledger.
      </p>

      <div className="mt-6">
        <PartyCreateForm defaultType="supplier" />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {suppliers.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No suppliers yet. Add your first supplier above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-900">{p.name}</td>
                  <td className="px-4 py-2 text-slate-600">{p.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
