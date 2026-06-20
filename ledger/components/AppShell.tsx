"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/BrandLogo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import type { SidebarCounts } from "@/lib/sidebar";

const SIDEBAR_CLOSE_DELAY = 250;
const LEFT_EDGE_WIDTH = 14;

function useHoverCapable() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia("(hover: hover) and (pointer: fine)");
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    () => false,
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarHoverOpen, setSidebarHoverOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const hoverCapable = useHoverCapable();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const t = useTranslations("nav");

  const sidebarOpen = mobileOpen || sidebarHoverOpen;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openSidebar = useCallback(() => {
    if (!hoverCapable) return;
    clearCloseTimer();
    setSidebarHoverOpen(true);
  }, [hoverCapable, clearCloseTimer]);

  const scheduleCloseSidebar = useCallback(() => {
    if (!hoverCapable || createMenuOpen) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      const overSidebar = sidebarRef.current?.matches(":hover");
      const overEdge = edgeRef.current?.matches(":hover");
      if (!overSidebar && !overEdge) {
        setSidebarHoverOpen(false);
      }
    }, SIDEBAR_CLOSE_DELAY);
  }, [hoverCapable, createMenuOpen, clearCloseTimer]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!hoverCapable || !sidebarHoverOpen) return;

    function onPointerMove(event: PointerEvent) {
      if (createMenuOpen) {
        clearCloseTimer();
        return;
      }
      const overSidebar = sidebarRef.current?.contains(event.target as Node);
      const overEdge = edgeRef.current?.contains(event.target as Node);
      if (overSidebar || overEdge || event.clientX <= LEFT_EDGE_WIDTH) {
        clearCloseTimer();
        return;
      }
      scheduleCloseSidebar();
    }

    document.addEventListener("pointermove", onPointerMove);
    return () => document.removeEventListener("pointermove", onPointerMove);
  }, [hoverCapable, sidebarHoverOpen, createMenuOpen, clearCloseTimer, scheduleCloseSidebar]);

  function closeSidebar() {
    setMobileOpen(false);
    setSidebarHoverOpen(false);
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {hoverCapable ? (
        <div
          ref={edgeRef}
          aria-hidden
          className="fixed inset-y-0 left-0 z-40 hidden md:block"
          style={{ width: LEFT_EDGE_WIDTH }}
          onMouseEnter={openSidebar}
          onMouseLeave={scheduleCloseSidebar}
        />
      ) : null}

      <Sidebar
        ref={sidebarRef}
        orgName={orgName}
        counts={counts}
        open={sidebarOpen}
        onNavigate={closeSidebar}
        onClose={closeSidebar}
        onMouseEnter={hoverCapable ? openSidebar : undefined}
        onMouseLeave={hoverCapable ? scheduleCloseSidebar : undefined}
        onCreateMenuOpenChange={setCreateMenuOpen}
      />

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur print:hidden">
          <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
            <button
              type="button"
              aria-label={t("openMenu")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-slate-700 md:hidden"
              onClick={() => setMobileOpen(true)}
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
