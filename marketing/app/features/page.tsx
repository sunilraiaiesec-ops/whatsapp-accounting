import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description: "Invoicing, inventory, accounting, and WhatsApp automation — everything BantooBooks does.",
};

const content = {
  title: "Everything you need to run the books.",
  subtitle: "One system for invoicing, inventory, and accounting — no spreadsheets, no guesswork.",
  groups: [
    {
      title: "Invoicing",
      items: [
        "Branded, document-style invoices with your logo and business details",
        "Configurable invoice numbering for your market and business",
        "Send by email or WhatsApp, track payment status in real time",
      ],
    },
    {
      title: "Inventory",
      items: [
        "Track stock levels, cost, and selling price per product",
        "Low-stock alerts before you run out",
        "Cost of goods sold calculated automatically on every sale",
      ],
    },
    {
      title: "Accounting",
      items: [
        "A full chart of accounts and general ledger under the hood",
        "Accounts receivable and payable aging reports",
        "Multi-user roles and an approval workflow for larger teams",
      ],
    },
    {
      title: "Built for WhatsApp-first teams",
      items: [
        "Log sales, expenses, and stock moves over WhatsApp",
        "Bilingual English/French support",
        "Payment and low-stock reminders sent automatically",
      ],
    },
  ],
};

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">{content.title}</h1>
        <p className="mt-4 text-lg text-slate-600">{content.subtitle}</p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2">
        {content.groups.map((group) => (
          <div key={group.title} className="card-surface p-6">
            <h2 className="text-lg font-semibold text-slate-900">{group.title}</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-[var(--brand)]">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
