import Link from "next/link";

const APP_URL = "https://books.bantoobooks.com";

const content = {
  hero: {
    eyebrow: "Accounting built for growing businesses",
    title: "Bookkeeping that keeps up with how you actually run your business.",
    subtitle:
      "Invoicing, inventory, and accounting in one place — with WhatsApp-native bookkeeping and bilingual English/French support, built for businesses across Africa.",
    primaryCta: "Start free",
    secondaryCta: "See pricing",
  },
  highlights: [
    {
      title: "Invoice in seconds",
      body: "Professional, document-style invoices with your own branding, sent by email or WhatsApp.",
    },
    {
      title: "Real double-entry accounting",
      body: "A full chart of accounts and general ledger under the hood — not a spreadsheet with a nice coat of paint.",
    },
    {
      title: "Built for WhatsApp-first teams",
      body: "Log sales, expenses, and stock moves the way your team already works — over WhatsApp.",
    },
  ],
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="flex flex-col items-start gap-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--brand)]">{content.hero.eyebrow}</p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {content.hero.title}
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">{content.hero.subtitle}</p>
        <div className="flex flex-wrap gap-3">
          <a href={`${APP_URL}/signup?plan=free`} className="btn-brand">
            {content.hero.primaryCta}
          </a>
          <Link href="/pricing" className="btn-outline">
            {content.hero.secondaryCta}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 pb-24 sm:grid-cols-3">
        {content.highlights.map((item) => (
          <div key={item.title} className="card-surface p-6">
            <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{item.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
