import { AppShell } from "@/components/AppShell";
import { InvoiceCreator } from "@/components/InvoiceCreator";
import { serverApi } from "@/lib/server-api";
import type { Party, Product } from "@/lib/types";

type PartiesResponse = { items: Party[]; count: number };
type ProductsResponse = {
  items: Product[];
  count: number;
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{
    party_id?: string;
    amount?: string;
    receipt_id?: string;
    description?: string;
  }>;
}) {
  const params = await searchParams;
  const [parties, products] = await Promise.all([
    serverApi<PartiesResponse>("parties"),
    serverApi<ProductsResponse>("products"),
  ]);

  return (
    <AppShell
      title="New invoice"
      subtitle="Create a sales invoice for a client"
    >
      <InvoiceCreator
        parties={parties.items.map((p) => ({
          id: p.id,
          name: p.name,
          party_type: p.party_type,
        }))}
        products={products.items.map((p) => ({
          id: p.id,
          name: p.name,
          default_unit: p.default_unit,
          default_unit_price_fcfa: p.default_unit_price_fcfa,
        }))}
        initialPartyId={
          params.party_id ? Number(params.party_id) : undefined
        }
        initialAmount={params.amount ? Number(params.amount) : undefined}
        initialReceiptId={params.receipt_id}
        initialDescription={params.description}
      />
    </AppShell>
  );
}
