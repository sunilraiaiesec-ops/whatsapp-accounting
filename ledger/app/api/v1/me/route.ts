import { ApiAuthError, requireApiContext } from "@/lib/api/context";
import { error, json } from "@/lib/api/http";

export { OPTIONS } from "@/lib/api/route-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    return json({
      user: {
        id: ctx.userId,
        name: ctx.userName,
        email: ctx.userEmail,
        role: ctx.role,
      },
      org: {
        id: ctx.orgId,
        name: ctx.orgName,
        baseCurrency: ctx.baseCurrency,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}
