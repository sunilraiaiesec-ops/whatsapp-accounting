export const SESSION_COOKIE = "wa_backend_session";

export function getApiUrl(): string {
  return (
    process.env.API_URL?.trim() ||
    "https://whatsapp-accounting.onrender.com"
  );
}

export function parseSessionFromSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/session=([^;]+)/);
  return match?.[1] ?? null;
}

export function parseSessionFromSetCookieList(setCookies: string[]): string | null {
  for (const header of setCookies) {
    const value = parseSessionFromSetCookie(header);
    if (value) return value;
  }
  return null;
}
