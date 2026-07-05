import Link from "next/link";

export type PartyTabKey =
  | "overview"
  | "transactions"
  | "invoices"
  | "payments"
  | "products"
  | "documents"
  | "notes"
  | "ai-memory";

export function partyTabHref(basePath: string, tab: PartyTabKey): string {
  return tab === "overview" ? basePath : `${basePath}?tab=${tab}`;
}

export function PartyTabs({
  basePath,
  active,
  labels,
}: {
  basePath: string;
  active: PartyTabKey;
  labels: Record<PartyTabKey, string>;
}) {
  const tabs: PartyTabKey[] = [
    "overview",
    "transactions",
    "invoices",
    "payments",
    "products",
    "documents",
    "notes",
    "ai-memory",
  ];

  return (
    <div className="mb-6 overflow-x-auto border-b border-[var(--border)]">
      <nav className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const isActive = tab === active;
          return (
            <Link
              key={tab}
              href={partyTabHref(basePath, tab)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "border-[var(--brand)] text-[var(--brand)]"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {labels[tab]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
