import { prisma } from "@/lib/prisma";
import { normalizeText, rankMatches } from "@/lib/bantoo/match";

export function listParties(orgId: string, type?: "customer" | "supplier") {
  return prisma.party.findMany({
    where: {
      orgId,
      ...(type ? { type: { in: [type, "both"] } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// Quick-add shape — unchanged from before the contact-profile upgrade, so
// existing callers (the quick-add form, Ask Bantoo's create-party flow)
// keep working exactly as before. Extended profile fields are set separately
// via updateParty/updatePartyProfile, never required at creation time.
export type CreatePartyInput = {
  name: string;
  type: string;
  phone?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  city?: string | null;
};

export async function createParty(orgId: string, data: CreatePartyInput) {
  return prisma.party.create({
    data: {
      orgId,
      name: data.name.trim(),
      type: data.type,
      phone: data.phone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || null,
      country: data.country?.trim() || null,
      city: data.city?.trim() || null,
    },
  });
}

// Extended "Profile" fields, editable separately from quick-add. All
// optional/nullable — omitted keys are left untouched, explicit `null`
// clears the field.
export type PartyProfileInput = {
  email?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  taxId?: string | null;
  defaultCurrency?: string | null;
  preferredLanguage?: string | null;
  paymentTermsDays?: number | null;
  creditLimit?: bigint | null;
  defaultDiscount?: string | number | null;
  preferredPaymentMethod?: string | null;
};

export type PartyQuickFieldsInput = {
  name?: string;
  type?: string;
  phone?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  city?: string | null;
};

function trimOrNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function updateParty(
  orgId: string,
  id: string,
  data: PartyQuickFieldsInput & PartyProfileInput,
) {
  const party = await prisma.party.findFirst({ where: { orgId, id }, select: { id: true } });
  if (!party) return null;

  return prisma.party.update({
    where: { id },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      type: data.type,
      phone: trimOrNull(data.phone),
      whatsapp: trimOrNull(data.whatsapp),
      country: trimOrNull(data.country),
      city: trimOrNull(data.city),
      email: trimOrNull(data.email),
      address: trimOrNull(data.address),
      googleMapsUrl: trimOrNull(data.googleMapsUrl),
      companyName: trimOrNull(data.companyName),
      contactPerson: trimOrNull(data.contactPerson),
      taxId: trimOrNull(data.taxId),
      defaultCurrency: trimOrNull(data.defaultCurrency),
      preferredLanguage: trimOrNull(data.preferredLanguage),
      paymentTermsDays: data.paymentTermsDays,
      creditLimit: data.creditLimit,
      defaultDiscount:
        data.defaultDiscount === null || data.defaultDiscount === undefined
          ? data.defaultDiscount
          : String(data.defaultDiscount),
      preferredPaymentMethod: trimOrNull(data.preferredPaymentMethod),
    },
  });
}

export async function updatePartyNotes(orgId: string, id: string, notes: string | null) {
  const party = await prisma.party.findFirst({ where: { orgId, id }, select: { id: true } });
  if (!party) return null;
  return prisma.party.update({ where: { id }, data: { notes: trimOrNull(notes) } });
}

// ---------------------------------------------------------------------------
// Duplicate-contact detection (used by quick-add, the profile page, and Ask
// Bantoo's create-new-party flow). Reuses the shared Ask Bantoo fuzzy matcher
// (lib/bantoo/match.ts) instead of a second implementation, so "likely the
// same contact" means the same thing everywhere in the app: exact / case- /
// accent-insensitive / fuzzy name match (via rankMatches+normalizeText), plus
// an exact phone/WhatsApp match regardless of name similarity.
// ---------------------------------------------------------------------------

export type PartyDuplicateCandidate = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  whatsapp: string | null;
  score: number; // 0-100; 100 for a phone/WhatsApp exact hit
  matchedOn: "name" | "phone" | "whatsapp";
};

// Threshold above which a name match is worth surfacing as "possibly the
// same contact" — deliberately the same MATCH_MEDIUM bucket Ask Bantoo uses
// for "best match, please confirm" so the duplicate prompt and the Ask
// Bantoo dropdowns agree on what counts as "close enough".
const DUPLICATE_NAME_FLOOR = 60;

export async function findPossiblePartyDuplicates(
  orgId: string,
  input: { name: string; phone?: string | null; whatsapp?: string | null; excludeId?: string },
): Promise<PartyDuplicateCandidate[]> {
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;
  const whatsapp = input.whatsapp?.trim() || null;
  if (!name && !phone && !whatsapp) return [];

  const candidates = await prisma.party.findMany({
    where: { orgId, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    select: { id: true, name: true, type: true, phone: true, whatsapp: true },
  });

  const byId = new Map<string, PartyDuplicateCandidate>();

  // Exact phone/WhatsApp match is a strong, unambiguous signal (score 100)
  // even if the name differs entirely (typo'd name, same number).
  for (const c of candidates) {
    if (phone && c.phone && c.phone.trim() === phone) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        whatsapp: c.whatsapp,
        score: 100,
        matchedOn: "phone",
      });
    }
    if (whatsapp && c.whatsapp && c.whatsapp.trim() === whatsapp) {
      const existing = byId.get(c.id);
      if (!existing || existing.score < 100) {
        byId.set(c.id, {
          id: c.id,
          name: c.name,
          type: c.type,
          phone: c.phone,
          whatsapp: c.whatsapp,
          score: 100,
          matchedOn: "whatsapp",
        });
      }
    }
  }

  // Name similarity: exact / case- / accent-insensitive / fuzzy, via the same
  // matcher Ask Bantoo uses for master-data resolution.
  if (name) {
    const ranked = rankMatches(
      name,
      candidates.map((c) => ({ id: c.id, label: c.name })),
      { floor: DUPLICATE_NAME_FLOOR, limit: 5 },
    );
    for (const r of ranked) {
      if (byId.has(r.id)) continue; // phone/WhatsApp match already wins
      const c = candidates.find((cand) => cand.id === r.id);
      if (!c) continue;
      byId.set(r.id, {
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        whatsapp: c.whatsapp,
        score: r.score,
        matchedOn: "name",
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

// Re-exported for callers that want to normalize a name themselves (e.g. to
// compare without hitting the DB) without a second import of the matcher.
export { normalizeText };
