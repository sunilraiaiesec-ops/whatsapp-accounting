"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/BrandLogo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import type { SidebarCounts } from "@/lib/sidebar";

export function AppShell({
  orgName,
  counts,
  userName,
  userEmail,
  children,
}: {
  orgName: string;
  counts: SidebarCounts;
  userName: string;
  userEmail: string;
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

            <div className="hidden min-w-0 max-w-xl flex-1 md:block">
              <GlobalSearch />
            </div>

            <UserMenu
              userName={userName}
              userEmail={userEmail}
              orgName={orgName}
            />
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
