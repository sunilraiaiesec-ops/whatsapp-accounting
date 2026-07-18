import Link from "next/link";

const APP_URL = "https://books.bantoobooks.com";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/product", label: "Product" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-1 text-lg font-bold tracking-tight">
          <span className="text-[var(--brand)]">BANTOO</span>
          <span className="text-slate-900">BOOKS</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-[var(--brand)]">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a href={`${APP_URL}/login`} className="text-sm font-medium text-slate-600 hover:text-[var(--brand)]">
            Sign in
          </a>
          <a href={`${APP_URL}/signup`} className="btn-brand text-sm">
            Get started
          </a>
        </div>
      </div>
    </header>
  );
}
