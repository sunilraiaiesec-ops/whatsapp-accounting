"use client";

import { useState } from "react";

import { Sidebar } from "@/components/Sidebar";
import type { SidebarCounts } from "@/lib/sidebar";

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

  return (
    <div className="flex min-h-screen">
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 print:hidden md:justify-end md:px-6">
          <button
            type="button"
            aria-label="Open menu"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1 md:hidden">
            <div className="truncate text-sm font-semibold text-slate-900">
              {orgName}
            </div>
            <div className="text-xs text-slate-500">Bantoo Books</div>
          </div>

          <div className="hidden text-right md:block">
            <div className="text-sm font-medium text-slate-900">{userName}</div>
            <div className="text-xs text-slate-500">
              {userEmail} · {baseCurrency}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
