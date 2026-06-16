import { AppShell } from "@/components/AppShell";
import { ProductPriceEditor } from "@/components/ProductPriceEditor";
import { serverApi } from "@/lib/server-api";

type Product = {
  id: number;
  name: string;
  default_unit: string | null;
  default_unit_price_fcfa: number | null;
  delivery_count: number;
  total_quantity_delivered: number;
};

type ProductsResponse = {
  items: Product[];
  count: number;
};

export default async function ProductsPage() {
  const data = await serverApi<ProductsResponse>("products");

  return (
    <AppShell
      title="Products"
      subtitle="Set unit prices for goods value calculations"
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Unit price (FCFA)</th>
              <th className="px-4 py-3">Deliveries</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((product) => (
              <tr key={product.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{product.name}</td>
                <td className="px-4 py-3">{product.default_unit ?? "—"}</td>
                <td className="px-4 py-3">
                  <ProductPriceEditor
                    productId={product.id}
                    initialPrice={product.default_unit_price_fcfa}
                  />
                </td>
                <td className="px-4 py-3">{product.delivery_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
