// ---------------------------------------------------------------------------
// Placeholder "platform admin" gate for the internal commercial dashboard and
// partner-management pages.
//
// There is no platform-admin concept in the schema today, and the parallel
// "Roles, Permissions & Approval Workflow" task owns building a real
// permission matrix. Until that lands, platform-admin access is gated by a
// simple env-var allow-list of emails — NOT a Membership role, NOT
// org-scoped. This must be reconciled once the other task ships a real
// permission system (see the final report's "needs reconciling" section).
// ---------------------------------------------------------------------------

function parseAllowList(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAllowList().has(email.trim().toLowerCase());
}
