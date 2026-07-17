import { parsePhoneNumberFromString } from "libphonenumber-js";

// Server-only (kept separate from lib/phone.ts's WhatsApp digit-normalizers,
// which are imported by client components — libphonenumber-js's metadata
// should never land in a client bundle that doesn't actually need it).

/**
 * Re-validates and normalizes a phone number to E.164 server-side. Never
 * trust the client's formatting — components/PhoneField.tsx already submits
 * E.164, but a raw HTTP client (app/api/v1) or a tampered form could send
 * anything. Returns null if the value isn't a valid phone number.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw.trim());
  return parsed?.isValid() ? parsed.number : null;
}
