"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireContext } from "@/lib/auth/current";
import {
  createParty,
  findPossiblePartyDuplicates,
  updateParty,
  updatePartyNotes,
  type PartyDuplicateCandidate,
} from "@/lib/parties";
import { prisma } from "@/lib/prisma";
import type { PartyEnrichmentSuggestion } from "@/lib/party-insights";

export type PartyState = {
  error?: string;
  duplicates?: PartyDuplicateCandidate[];
  // Echoed back so the "possible duplicate" prompt can re-submit the exact
  // same values with confirmCreate=1 without losing what the user typed.
  pending?: { name: string; type: string; phone: string; whatsapp: string; country: string; city: string };
};

const quickAddSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(["customer", "supplier", "both"]),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

// Quick-add — kept deliberately minimal (name, type, phone, whatsapp,
// country, city). Before creating, checks for likely-duplicate contacts
// (exact/case/accent/fuzzy name match, or an exact phone/WhatsApp match) and,
// if any are found, returns them instead of creating — the form then offers
// "Use existing contact" (no-op here, the existing contact is already in the
// list) or "Create new anyway" (re-submits with confirmCreate=1).
export async function createPartyAction(
  _prev: PartyState,
  formData: FormData,
): Promise<PartyState> {
  const ctx = await requireContext();
  const parsed = quickAddSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "both",
    phone: formData.get("phone") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    country: formData.get("country") || undefined,
    city: formData.get("city") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const confirmCreate = formData.get("confirmCreate") === "1";

  if (!confirmCreate) {
    const duplicates = await findPossiblePartyDuplicates(ctx.orgId, {
      name: data.name,
      phone: data.phone,
      whatsapp: data.whatsapp,
    });
    if (duplicates.length > 0) {
      return {
        duplicates,
        pending: {
          name: data.name,
          type: data.type,
          phone: data.phone ?? "",
          whatsapp: data.whatsapp ?? "",
          country: data.country ?? "",
          city: data.city ?? "",
        },
      };
    }
  }

  await createParty(ctx.orgId, data);
  redirect(data.type === "supplier" ? "/suppliers" : "/customers");
}

// Extended "Profile" fields, edited separately from quick-add.
export type PartyProfileState = { error?: string; ok?: boolean };

const profileSchema = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().optional(),
  googleMapsUrl: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  contactPerson: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  defaultCurrency: z.string().trim().optional(),
  preferredLanguage: z.string().trim().optional(),
  paymentTermsDays: z.string().trim().optional(),
  creditLimit: z.string().trim().optional(),
  defaultDiscount: z.string().trim().optional(),
  preferredPaymentMethod: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

export async function updatePartyProfileAction(
  partyId: string,
  _prev: PartyProfileState,
  formData: FormData,
): Promise<PartyProfileState> {
  const ctx = await requireContext();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const toInt = (v?: string) => (v && v.trim() ? Number.parseInt(v, 10) : null);
  const toBigInt = (v?: string) => {
    if (!v || !v.trim()) return null;
    try {
      return BigInt(v.trim());
    } catch {
      return null;
    }
  };

  const updated = await updateParty(ctx.orgId, partyId, {
    phone: d.phone,
    whatsapp: d.whatsapp,
    country: d.country,
    city: d.city,
    email: d.email || null,
    address: d.address,
    googleMapsUrl: d.googleMapsUrl,
    companyName: d.companyName,
    contactPerson: d.contactPerson,
    taxId: d.taxId,
    defaultCurrency: d.defaultCurrency,
    preferredLanguage: d.preferredLanguage,
    paymentTermsDays: toInt(d.paymentTermsDays),
    creditLimit: toBigInt(d.creditLimit),
    defaultDiscount: d.defaultDiscount && d.defaultDiscount.trim() ? d.defaultDiscount : null,
    preferredPaymentMethod: d.preferredPaymentMethod,
  });
  if (!updated) return { error: "Contact not found." };
  return { ok: true };
}

export type PartyNotesState = { error?: string; ok?: boolean };

export async function updatePartyNotesAction(
  partyId: string,
  _prev: PartyNotesState,
  formData: FormData,
): Promise<PartyNotesState> {
  const ctx = await requireContext();
  const notes = String(formData.get("notes") ?? "");
  const updated = await updatePartyNotes(ctx.orgId, partyId, notes || null);
  if (!updated) return { error: "Contact not found." };
  return { ok: true };
}

// Applies the `accept` action of a gentle enrichment suggestion (see
// lib/party-insights.ts getPartyEnrichmentSuggestions). Dismissal has no
// server-side counterpart — the UI just hides it client-side.
export async function acceptPartyEnrichmentSuggestionAction(
  partyId: string,
  accept: PartyEnrichmentSuggestion["accept"],
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireContext();
  const party = await prisma.party.findFirst({ where: { orgId: ctx.orgId, id: partyId } });
  if (!party) return { ok: false, error: "Contact not found." };

  switch (accept.type) {
    case "focus_field":
      // Nothing to persist — the client focuses the corresponding Profile
      // field. Present here mainly so the action type is exhaustively handled.
      return { ok: true };
    case "set_payment_terms":
      await prisma.party.update({ where: { id: partyId }, data: { paymentTermsDays: accept.days } });
      return { ok: true };
    case "set_preferred_payment_method":
      await prisma.party.update({
        where: { id: partyId },
        data: { preferredPaymentMethod: accept.method },
      });
      return { ok: true };
    case "append_note": {
      const existing = party.notes?.trim();
      const next = existing ? `${existing}\n${accept.note}` : accept.note;
      await prisma.party.update({ where: { id: partyId }, data: { notes: next } });
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unsupported suggestion." };
  }
}
