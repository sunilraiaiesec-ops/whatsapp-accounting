import { ApiAuthError, requireApiContext } from "@/lib/api/context";
import { error, json } from "@/lib/api/http";
import { listParties } from "@/lib/parties";

export { OPTIONS } from "@/lib/api/route-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    const suppliers = await listParties(ctx.orgId, "supplier");
    return json({
      suppliers: suppliers.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        type: p.type,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}
