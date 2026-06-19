import { ApiAuthError, requireApiContext } from "@/lib/api/context";
import { error, json } from "@/lib/api/http";
import { bankAndCashAccounts, listAccounts } from "@/lib/accounts";

export { OPTIONS } from "@/lib/api/route-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    const [bankCash, accounts] = await Promise.all([
      bankAndCashAccounts(ctx.orgId),
      listAccounts(ctx.orgId),
    ]);

    return json({
      bankAndCash: bankCash.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        subtype: a.subtype,
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        isControl: a.isControl,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}
