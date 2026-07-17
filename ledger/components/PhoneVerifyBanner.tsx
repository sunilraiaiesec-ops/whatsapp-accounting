"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

// Deliberately calmer styling than EmailVerifyBanner (blue "tip", not amber
// "action needed") — phone verification is an ADDITIONAL, optional layer
// (extra security + account recovery), never required to use the app.
export function PhoneVerifyBanner({ verified }: { verified: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const t = useTranslations("auth");

  if (verified || dismissed) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
      <span className="flex-1">{t("phoneVerifyBanner")}</span>
      <Link href="/verify-phone" className="font-semibold text-sky-900 underline">
        {t("phoneVerifyBannerAction")}
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-sky-500 hover:text-sky-800"
      >
        ✕
      </button>
    </div>
  );
}
