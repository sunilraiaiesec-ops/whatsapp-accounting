import Link from "next/link";

const APP_URL = "https://books.bantoobooks.com";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} BantooBooks. All rights reserved.</p>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/features" className="hover:text-[var(--brand)]">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-[var(--brand)]">
            Pricing
          </Link>
          <Link href="/product" className="hover:text-[var(--brand)]">
            Product
          </Link>
          <a href={`${APP_URL}/terms`} className="hover:text-[var(--brand)]">
            Terms
          </a>
          <a href={`${APP_URL}/privacy`} className="hover:text-[var(--brand)]">
            Privacy
          </a>
        </nav>
      </div>
    </footer>
  );
}
