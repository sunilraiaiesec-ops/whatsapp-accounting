import { ApiAuthError, requireApiContext } from "@/lib/api/context";
import { error, json } from "@/lib/api/http";
import { formatAmount } from "@/lib/money";
import { balanceSheet, profitAndLoss } from "@/lib/reports";
import { getSidebarCounts } from "@/lib/sidebar";

export { OPTIONS } from "@/lib/api/route-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    const cur = ctx.baseCurrency;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [bs, pnl, counts] = await Promise.all([
      balanceSheet(ctx.orgId),
      profitAndLoss(ctx.orgId, monthStart, monthEnd),
      getSidebarCounts(ctx.orgId),
    ]);

    return json({
      currency: cur,
      stats: {
        totalAssets: formatAmount(bs.totalAssets, cur),
        totalLiabilities: formatAmount(bs.totalLiabilities, cur),
        totalEquity: formatAmount(bs.totalEquity, cur),
        netProfitThisMonth: formatAmount(pnl.netProfit, cur),
        balanced: bs.balanced,
      },
      counts: {
        customers: counts["/customers"] ?? 0,
        suppliers: counts["/suppliers"] ?? 0,
        receipts: counts["/receipts"] ?? 0,
        payments: counts["/payments"] ?? 0,
        salesInvoices: counts["/sales-invoices"] ?? 0,
        purchaseInvoices: counts["/purchase-invoices"] ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}
