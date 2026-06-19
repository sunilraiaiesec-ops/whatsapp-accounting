"use client";

import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Sidebar } from "@/components/Sidebar";
import type { SidebarCounts } from "@/lib/sidebar";
import { useTranslations } from "next-intl";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({
  orgName,
  counts,
  userName,
  userEmail,
  baseCurrency,
  children,
}: {
  orgName: string;
  counts: SidebarCounts;
  userName: string;
  userEmail: string;
  baseCurrency: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <Sidebar
        orgName={orgName}
        counts={counts}
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
        onClose={() => setMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur print:hidden">
          <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
            <button
              type="button"
              aria-label={t("openMenu")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-slate-700 md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>

            <BrandLogo href="/dashboard" />

            <div className="hidden min-w-0 flex-1 md:block">
              <label className="relative block max-w-xl">
                <span className="sr-only">{t("search")}</span>
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3-3" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  placeholder={t("searchPlaceholder")}
                  className="input-search"
                  disabled
                  title={t("searchSoon")}
                />
              </label>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <LanguageSwitcher />
              <div className="hidden text-right sm:block">
                <div className="max-w-[180px] truncate text-sm font-semibold text-slate-900">
                  {orgName}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {baseCurrency} · {userEmail}
                </div>
              </div>
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold text-white"
                title={userName}
              >
                {initials(userName)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
