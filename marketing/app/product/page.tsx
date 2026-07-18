import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product",
  description: "What BantooBooks is, and who it's built for.",
};

const content = {
  title: "Accounting software built for how African businesses actually operate.",
  paragraphs: [
    "BantooBooks is invoicing, inventory, and accounting software for small and growing businesses. It's built around real double-entry accounting, not a spreadsheet with a nice coat of paint — so your books are accurate from day one.",
    "Most accounting tools assume you're sitting at a desktop, typing every transaction into a form. BantooBooks meets your team where they already work: over WhatsApp. Log a sale, record an expense, or check stock levels without leaving the app you use all day.",
    "BantooBooks supports English and French out of the box, and multiple currencies including XAF, XOF, USD, EUR, and more — because \"international\" software shouldn't mean \"built for one market and translated later.\"",
  ],
};

export default function ProductPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">{content.title}</h1>
      <div className="mt-8 space-y-6 text-lg text-slate-600">
        {content.paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
