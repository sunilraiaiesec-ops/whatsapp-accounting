import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing for BantooBooks — Free, Professional, and Enterprise plans.",
};

const APP_URL = "https://books.bantoobooks.com";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For solo founders getting their first books in order.",
    cta: "Start free",
    href: `${APP_URL}/signup?plan=free`,
    features: ["Up to 2 users", "20 invoices / month", "50 products, 50 customers"],
    highlighted: false,
  },
  {
    name: "Professional",
    price: "Contact us",
    period: "14-day free trial",
    description: "For growing businesses that need the full toolkit.",
    cta: "Start 14-day Professional trial",
    href: `${APP_URL}/signup?plan=professional`,
    features: ["Up to 10 users", "Unlimited invoices", "Approval workflow", "WhatsApp automation"],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Contact us",
    period: "14-day free trial",
    description: "For larger teams with more advanced needs.",
    cta: "Start 14-day Enterprise trial",
    href: `${APP_URL}/signup?plan=enterprise`,
    features: ["Unlimited users", "Unlimited invoices", "Priority support", "All Professional features"],
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Simple, transparent pricing.</h1>
        <p className="mt-4 text-lg text-slate-600">
          Start free, upgrade when you&rsquo;re ready. No credit card required to try Professional or Enterprise.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`card-surface flex flex-col p-6 ${plan.highlighted ? "ring-2 ring-[var(--brand)]" : ""}`}
          >
            <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
            <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
            <div className="mt-6">
              <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
              <span className="ml-2 text-sm text-slate-500">{plan.period}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-slate-600">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden className="text-[var(--brand)]">
                    ✓
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a href={plan.href} className={plan.highlighted ? "btn-brand mt-8" : "btn-outline mt-8"}>
              {plan.cta}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
