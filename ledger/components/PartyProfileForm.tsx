"use client";

import { useActionState, useImperativeHandle, useRef } from "react";

import { updatePartyProfileAction, type PartyProfileState } from "@/app/actions/parties";

const initial: PartyProfileState = {};

export type PartyProfileFormHandle = { focusField: (field: "phone" | "whatsapp") => void };

type PartyProfileValues = {
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  email: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  companyName: string | null;
  contactPerson: string | null;
  taxId: string | null;
  defaultCurrency: string | null;
  preferredLanguage: string | null;
  paymentTermsDays: number | null;
  creditLimit: string | null; // BigInt serialized as string
  defaultDiscount: string | null;
  preferredPaymentMethod: string | null;
};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  inputRef,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        ref={inputRef}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="input-modern mt-1"
      />
    </label>
  );
}

export function PartyProfileForm({
  partyId,
  values,
  currency,
  formRef,
}: {
  partyId: string;
  values: PartyProfileValues;
  currency: string;
  formRef?: React.RefObject<PartyProfileFormHandle | null>;
}) {
  const boundAction = updatePartyProfileAction.bind(null, partyId);
  const [state, action, pending] = useActionState(boundAction, initial);
  const phoneRef = useRef<HTMLInputElement>(null);
  const whatsappRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(formRef, () => ({
    focusField: (field) => {
      const el = field === "phone" ? phoneRef.current : whatsappRef.current;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    },
  }));

  return (
    <form action={action} className="card-surface space-y-5 p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Contact</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Phone" name="phone" defaultValue={values.phone ?? undefined} inputRef={phoneRef} />
          <Field label="WhatsApp" name="whatsapp" defaultValue={values.whatsapp ?? undefined} inputRef={whatsappRef} />
          <Field label="Email" name="email" defaultValue={values.email ?? undefined} />
          <Field label="Country" name="country" defaultValue={values.country ?? undefined} />
          <Field label="City" name="city" defaultValue={values.city ?? undefined} />
          <Field label="Address" name="address" defaultValue={values.address ?? undefined} />
          <Field
            label="Google Maps link"
            name="googleMapsUrl"
            defaultValue={values.googleMapsUrl ?? undefined}
            placeholder="https://maps.app.goo.gl/…"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Business</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Company name" name="companyName" defaultValue={values.companyName ?? undefined} />
          <Field label="Contact person" name="contactPerson" defaultValue={values.contactPerson ?? undefined} />
          <Field label="Tax ID / registration no." name="taxId" defaultValue={values.taxId ?? undefined} />
          <Field
            label="Default currency"
            name="defaultCurrency"
            defaultValue={values.defaultCurrency ?? currency}
          />
          <Field label="Preferred language" name="preferredLanguage" defaultValue={values.preferredLanguage ?? undefined} placeholder="en / fr" />
          <Field label="Preferred payment method" name="preferredPaymentMethod" defaultValue={values.preferredPaymentMethod ?? undefined} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Terms</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Payment terms (days)" name="paymentTermsDays" defaultValue={values.paymentTermsDays != null ? String(values.paymentTermsDays) : undefined} placeholder="30" />
          <Field label={`Credit limit (${currency})`} name="creditLimit" defaultValue={values.creditLimit ?? undefined} placeholder="0" />
          <Field label="Default discount (%)" name="defaultDiscount" defaultValue={values.defaultDiscount ?? undefined} placeholder="0" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-brand">
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.ok ? <span className="text-sm text-[var(--brand)]">Saved.</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
