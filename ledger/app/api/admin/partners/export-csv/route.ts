import { NextResponse } from "next/server";

import { getCurrentContext } from "@/lib/auth/current";
import { isPlatformAdmin } from "@/lib/billing/admin-access";
import { exportCommissionsCsv } from "@/lib/billing/partners";

// Platform-admin-only CSV download — gated the same way as
// app/(app)/admin/partners/page.tsx. Plain data export, no payout
// automation: an admin still pays partners out of band.
export async function GET() {
  const ctx = await getCurrentContext();
  if (!isPlatformAdmin(ctx?.userEmail)) {
    return new NextResponse("Not authorized", { status: 403 });
  }

  const csv = await exportCommissionsCsv();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="commissions.csv"',
    },
  });
}
