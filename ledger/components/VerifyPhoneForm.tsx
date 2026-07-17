"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  sendPhoneVerificationCodeAction,
  confirmPhoneVerificationCodeAction,
  type PhoneVerifyState,
} from "@/app/actions/phone-verification";
import { PhoneField } from "@/components/PhoneField";

const initial: PhoneVerifyState = {};

export function VerifyPhoneForm({
  currentPhone,
  alreadyVerified,
}: {
  currentPhone: string;
  alreadyVerified: boolean;
}) {
  const t = useTranslations("auth");
  const [verified, setVerified] = useState(alreadyVerified);
  const [codeSent, setCodeSent] = useState(false);
  const [sendState, sendAction, sendPending] = useActionState(
    async (prev: PhoneVerifyState, formData: FormData) => {
      const result = await sendPhoneVerificationCodeAction(prev, formData);
      if (result.codeSent) setCodeSent(true);
      return result;
    },
    initial,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    async (prev: PhoneVerifyState, formData: FormData) => {
      const result = await confirmPhoneVerificationCodeAction(prev, formData);
      if (result.done) setVerified(true);
      return result;
    },
    initial,
  );

  if (verified && !codeSent) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--brand)]">{t("phoneVerified")}</p>
        <button
          type="button"
          onClick={() => setCodeSent(false)}
          className="mt-3 text-sm text-[var(--muted)] hover:text-[var(--brand)] hover:underline"
        >
          {t("changePhoneLink")}
        </button>
      </div>
    );
  }

  if (!codeSent) {
    return (
      <form action={sendAction} className="space-y-4">
        <PhoneField label={t("phone")} name="phone" defaultValue={currentPhone} />
        {sendState.error ? <p className="text-sm text-red-600">{sendState.error}</p> : null}
        <button type="submit" disabled={sendPending} className="btn-brand w-full disabled:opacity-50">
          {sendPending ? t("resending") : t("sendCode")}
        </button>
      </form>
    );
  }

  return (
    <form action={confirmAction} className="space-y-4">
      <p className="text-sm text-[var(--muted)]">{t("enterCodeHint")}</p>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("verificationCode")}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          className="input-modern mt-1 text-center text-lg tracking-[0.5em]"
        />
      </label>
      {confirmState.error ? <p className="text-sm text-red-600">{confirmState.error}</p> : null}
      <button type="submit" disabled={confirmPending} className="btn-brand w-full disabled:opacity-50">
        {confirmPending ? t("verifying") : t("verifyCode")}
      </button>
      <button
        type="button"
        onClick={() => setCodeSent(false)}
        className="block w-full text-center text-sm text-[var(--muted)] hover:text-[var(--brand)] hover:underline"
      >
        {t("resendOrChangeNumber")}
      </button>
    </form>
  );
}
