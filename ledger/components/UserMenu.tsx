"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function GlobeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function UserMenu({
  userName,
  userEmail,
  orgName,
}: {
  userName: string;
  userEmail: string;
  orgName: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("profile");
  const tn = useTranslations("nav");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="max-w-[200px] truncate text-sm font-semibold text-slate-900">
          {orgName}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label={t("openMenu")}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold text-white ring-2 ring-transparent transition hover:ring-[var(--brand)]/30 focus:outline-none focus-visible:ring-[var(--brand)]"
        >
          {initials(userName)}
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg"
          >
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="truncate font-semibold text-slate-900">{userName}</p>
              <p className="truncate text-xs text-[var(--muted)]">{userEmail}</p>
            </div>

            <div className="py-1">
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                </svg>
                {t("myProfile")}
              </Link>

              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" strokeLinecap="round" />
                </svg>
                {tn("settings")}
              </Link>
            </div>

            <div className="border-t border-[var(--border)] px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <GlobeIcon />
                {t("language")}
              </div>
              <LanguageSwitcher variant="menu" onChange={() => setOpen(false)} />
            </div>

            <div className="border-t border-[var(--border)] py-1">
              <form action={logoutAction}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {tn("signOut")}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
