"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

type CreateItem = {
  labelKey: string;
  href?: string;
  soon?: boolean;
};

type CreateSection = {
  titleKey: string;
  items: CreateItem[];
};

const SECTIONS: CreateSection[] = [
  {
    titleKey: "customers",
    items: [
      { labelKey: "salesInvoice", href: "/sales-invoices/new" },
      { labelKey: "paymentLink", soon: true },
      { labelKey: "receivePayment", href: "/receipts/new" },
      { labelKey: "statement", href: "/reports/customer-statement" },
      { labelKey: "estimate", soon: true },
      { labelKey: "salesOrder", soon: true },
      { labelKey: "creditMemo", href: "/credit-notes/new" },
      { labelKey: "salesReceipt", href: "/sales-receipts/new" },
      { labelKey: "refundReceipt", href: "/refund-receipts/new" },
      { labelKey: "delayedCredit", soon: true },
      { labelKey: "delayedCharge", soon: true },
      { labelKey: "addCustomer", href: "/customers" },
    ],
  },
  {
    titleKey: "suppliers",
    items: [
      { labelKey: "expense", href: "/payments/new?kind=expense" },
      { labelKey: "cheque", href: "/payments/new?kind=cheque" },
      { labelKey: "bill", href: "/purchase-invoices/new" },
      { labelKey: "payBills", href: "/payments/new" },
      { labelKey: "purchaseOrder", soon: true },
      { labelKey: "itemReceipt", href: "/goods-receipts/new" },
      { labelKey: "supplierCredit", href: "/debit-notes/new" },
      { labelKey: "creditCardCredit", soon: true },
      { labelKey: "printCheques", soon: true },
      { labelKey: "addSupplier", href: "/suppliers" },
    ],
  },
  {
    titleKey: "other",
    items: [
      { labelKey: "task", soon: true },
      { labelKey: "bankDeposit", href: "/receipts/new" },
      { labelKey: "transfer", href: "/inter-account-transfers/new" },
      { labelKey: "journalEntry", href: "/journal/new" },
      { labelKey: "inventoryQtyAdjustment", href: "/inventory-adjustments/new" },
      { labelKey: "batchTransactions", href: "/import" },
      { labelKey: "payDownCreditCard", href: "/inter-account-transfers/new?mode=credit-card" },
      { labelKey: "addProductService", href: "/inventory-items" },
      { labelKey: "writeOff", href: "/inventory-write-offs/new" },
      { labelKey: "bankAccount", href: "/bank-and-cash-accounts" },
    ],
  },
];

type PanelLayout = {
  panelTop: number;
  panelLeft: number;
  bridgeTop: number;
  bridgeLeft: number;
  bridgeWidth: number;
  bridgeHeight: number;
};

const HOVER_CLOSE_DELAY = 300;

function useClientMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function computePanelLayout(button: HTMLButtonElement): PanelLayout {
  const rect = button.getBoundingClientRect();
  const panelWidth = Math.min(window.innerWidth - 24, 832);
  const panelHeight = Math.min(window.innerHeight - 24, 544);
  const besideLeft = rect.right;
  const fitsBeside =
    window.innerWidth >= 768 && besideLeft + panelWidth <= window.innerWidth - 12;

  let panelTop: number;
  let panelLeft: number;

  if (fitsBeside) {
    panelTop = rect.top;
    panelLeft = besideLeft;
  } else {
    panelTop = rect.bottom + 8;
    panelLeft = Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12));
  }

  const bridgeLeft = Math.min(rect.right - 16, panelLeft);
  const bridgeRight = Math.max(rect.right + 8, panelLeft + 32);
  const bridgeTop = Math.min(rect.top, panelTop);
  const bridgeBottom = Math.max(rect.bottom, panelTop + panelHeight);

  return {
    panelTop,
    panelLeft,
    bridgeTop,
    bridgeLeft,
    bridgeWidth: Math.max(bridgeRight - bridgeLeft, 24),
    bridgeHeight: Math.max(bridgeBottom - bridgeTop, rect.height),
  };
}

function CreatePanel({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: () => void;
}) {
  const t = useTranslations("create");
  const tc = useTranslations("common");

  return (
    <div className="flex max-h-[min(34rem,calc(100vh-5rem))] w-[min(calc(100vw-1.5rem),52rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50/80 px-6 py-3.5">
        <h2 className="text-base font-semibold text-slate-900">{t("title")}</h2>
        <button
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto">
        <div className="divide-y divide-[var(--border)] md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
          {SECTIONS.map((section) => (
            <section key={section.titleKey} className="px-6 py-5 md:py-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                {t(`sections.${section.titleKey}`)}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) =>
                  item.soon || !item.href ? (
                    <li key={item.labelKey}>
                      <span className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-[15px] leading-snug text-slate-400">
                        <span>{t(`items.${item.labelKey}`)}</span>
                        {item.soon ? (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide">
                            {tc("soon")}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ) : (
                    <li key={item.labelKey}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className="block rounded-lg px-2 py-2.5 text-[15px] leading-snug text-slate-700 transition hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                      >
                        {t(`items.${item.labelKey}`)}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CreateMenu({
  onNavigate,
  onOpenChange,
}: {
  onNavigate?: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const mounted = useClientMounted();
  const [layout, setLayout] = useState<PanelLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const t = useTranslations("create");
  const tc = useTranslations("common");

  const isPointerOverMenu = useCallback(() => {
    return Boolean(
      rootRef.current?.matches(":hover") ||
        bridgeRef.current?.matches(":hover") ||
        panelRef.current?.matches(":hover"),
    );
  }, []);

  const refreshLayout = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    setLayout(computePanelLayout(button));
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    const button = buttonRef.current;
    if (button) {
      setLayout(computePanelLayout(button));
    }
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (!isPointerOverMenu()) {
        setOpen(false);
      }
    }, HOVER_CLOSE_DELAY);
  }, [clearCloseTimer, isPointerOverMenu]);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    function sync(event: MediaQueryListEvent) {
      setHoverCapable(event.matches);
    }
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  useLayoutEffect(() => {
    if (!open) return;
    refreshLayout();
  }, [open, refreshLayout]);

  useEffect(() => {
    if (!open) return;

    function onLayoutChange() {
      refreshLayout();
    }

    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [open, refreshLayout]);

  useEffect(() => {
    if (!open || !hoverCapable) return;

    function onPointerMove(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        bridgeRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        clearCloseTimer();
        return;
      }
      scheduleClose();
    }

    document.addEventListener("pointermove", onPointerMove);
    return () => document.removeEventListener("pointermove", onPointerMove);
  }, [open, hoverCapable, clearCloseTimer, scheduleClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || hoverCapable) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, hoverCapable]);

  function close() {
    clearCloseTimer();
    setOpen(false);
  }

  function handleNavigate() {
    close();
    onNavigate?.();
  }

  const hoverHandlers = hoverCapable
    ? { onMouseEnter: openMenu, onMouseLeave: scheduleClose }
    : undefined;

  const panel =
    open && layout && mounted ? (
      <>
        <div
          ref={bridgeRef}
          aria-hidden
          className="fixed z-[99]"
          style={{
            top: layout.bridgeTop,
            left: layout.bridgeLeft,
            width: layout.bridgeWidth,
            height: layout.bridgeHeight,
          }}
          {...hoverHandlers}
        />
        <div
          ref={panelRef}
          role="menu"
          aria-label={t("title")}
          className="fixed z-[100]"
          style={{ top: layout.panelTop, left: layout.panelLeft }}
          {...hoverHandlers}
        >
          <CreatePanel onClose={close} onNavigate={handleNavigate} />
        </div>
      </>
    ) : null;

  return (
    <>
      <div ref={rootRef} className="relative" {...hoverHandlers}>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={hoverCapable ? undefined : () => setOpen((value) => !value)}
          className={`btn-brand w-full gap-2 ${open ? "ring-2 ring-[var(--brand)]/40" : ""}`}
        >
          <span className="text-lg leading-none">+</span>
          {tc("create")}
        </button>
      </div>

      {panel && mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
