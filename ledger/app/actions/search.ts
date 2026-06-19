"use server";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";

export type SearchResultType =
  | "customer"
  | "supplier"
  | "salesInvoice"
  | "purchaseInvoice"
  | "receipt"
  | "payment";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  label: string;
  sublabel?: string;
  href: string;
};

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const ctx = await requireContext();
  const orgId = ctx.orgId;
  const insensitive = { contains: q, mode: "insensitive" as const };

  const [parties, salesInvoices, purchaseInvoices, receipts, payments] =
    await Promise.all([
      prisma.party.findMany({
        where: {
          orgId,
          OR: [{ name: insensitive }, { phone: insensitive }],
        },
        orderBy: { name: "asc" },
        take: 8,
      }),
      prisma.salesInvoice.findMany({
        where: { orgId, number: insensitive },
        include: { party: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.purchaseInvoice.findMany({
        where: { orgId, number: insensitive },
        include: { party: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.receipt.findMany({
        where: { orgId, number: insensitive },
        include: { party: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.payment.findMany({
        where: { orgId, number: insensitive },
        include: { party: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const results: SearchResult[] = [];

  for (const p of parties) {
    const isSupplier = p.type === "supplier";
    results.push({
      id: p.id,
      type: isSupplier ? "supplier" : "customer",
      label: p.name,
      sublabel: p.phone ?? undefined,
      href: isSupplier ? `/suppliers/${p.id}` : `/customers/${p.id}`,
    });
  }

  for (const inv of salesInvoices) {
    results.push({
      id: inv.id,
      type: "salesInvoice",
      label: inv.number,
      sublabel: inv.party?.name,
      href: `/sales-invoices/${inv.id}`,
    });
  }

  for (const inv of purchaseInvoices) {
    results.push({
      id: inv.id,
      type: "purchaseInvoice",
      label: inv.number,
      sublabel: inv.party?.name,
      href: `/purchase-invoices/${inv.id}`,
    });
  }

  for (const r of receipts) {
    results.push({
      id: r.id,
      type: "receipt",
      label: r.number,
      sublabel: r.party?.name,
      href: `/receipts/${r.id}`,
    });
  }

  for (const p of payments) {
    results.push({
      id: p.id,
      type: "payment",
      label: p.number,
      sublabel: p.party?.name,
      href: `/payments/${p.id}`,
    });
  }

  return results;
}
