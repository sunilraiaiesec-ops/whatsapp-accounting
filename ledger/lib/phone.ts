// ---------------------------------------------------------------------------
// Phone number normalization for WhatsApp click-to-chat (`wa.me/<digits>`)
// links. Cameroon-first (this app's primary market) but tries to pass other
// international numbers through sensibly rather than hard-failing on them.
//
// Pure, framework-agnostic module — no Prisma/server imports — so it can be
// imported directly from client components as well as server code.
//
// wa.me expects digits only (country code + national number, no leading
// "+", no spaces/dashes). See https://faq.whatsapp.com/5913398998672934 for
// the click-to-chat link format.
// ---------------------------------------------------------------------------

const CAMEROON_COUNTRY_CODE = "237";
// Cameroon mobile numbers are 9 digits and start with 6 (e.g. 6XXXXXXXX).
const CM_BARE_MOBILE_LENGTH = 9;
const CM_FULL_LENGTH = 12; // 237 + 9-digit mobile/local number.
// E.164 allows up to 15 digits total (country code + subscriber number);
// we accept from 8 (shortest plausible country code + local number).
const MIN_INTERNATIONAL_DIGITS = 8;
const MAX_INTERNATIONAL_DIGITS = 15;

/**
 * Normalize a free-typed phone number into a digits-only string suitable for
 * a `wa.me/<digits>` link, or `null` if the input doesn't look like a usable
 * phone number.
 *
 * Rules (in order):
 * 1. Strip everything but digits and a leading `+` marker.
 * 2. A bare 9-digit number starting with `6` (Cameroon mobile) becomes
 *    `237` + the digits.
 * 3. A number already starting with `237`/`+237` and totaling 12 digits is
 *    passed through as digits-only.
 * 4. A number that already looks like full international format (has a
 *    leading `+`, or is simply longer than a bare local Cameroon number) and
 *    whose digit count falls in a plausible international range is passed
 *    through as digits-only.
 * 5. Anything else (too short, non-numeric, ambiguous) returns `null` rather
 *    than guessing.
 */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Bare Cameroon mobile: 6XXXXXXXX -> 2376XXXXXXXX.
  if (!hasLeadingPlus && digits.length === CM_BARE_MOBILE_LENGTH && digits.startsWith("6")) {
    return `${CAMEROON_COUNTRY_CODE}${digits}`;
  }

  // Already carries the Cameroon country code (with or without a leading +).
  if (digits.startsWith(CAMEROON_COUNTRY_CODE) && digits.length === CM_FULL_LENGTH) {
    return digits;
  }

  // Otherwise, treat it as already-international if it's marked with a "+"
  // or if it's simply longer than a bare 9-digit local number (implying a
  // country code is already present) — and the total length is plausible.
  const looksInternational = hasLeadingPlus || digits.length > CM_BARE_MOBILE_LENGTH;
  if (
    looksInternational &&
    digits.length >= MIN_INTERNATIONAL_DIGITS &&
    digits.length <= MAX_INTERNATIONAL_DIGITS
  ) {
    return digits;
  }

  return null;
}

// Picks the best usable phone number for a contact that may have both a
// `whatsapp` and a `phone` field (Party model) — prefers the explicit
// WhatsApp number when present, since that's the more reliable signal for a
// WhatsApp-specific flow, falling back to the general phone number.
// Returns `null` when neither field normalizes to a usable number — callers
// (e.g. the low-stock quote-request UI) use that to show "Supplier phone
// number missing. Add phone number first." instead of a broken wa.me link.
export function resolveContactWhatsAppNumber(contact: {
  phone: string | null;
  whatsapp: string | null;
}): string | null {
  return normalizePhoneForWhatsApp(contact.whatsapp) ?? normalizePhoneForWhatsApp(contact.phone);
}
