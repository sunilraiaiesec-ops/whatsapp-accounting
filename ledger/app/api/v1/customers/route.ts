import { z } from "zod";

import { ApiAuthError, requireApiContext } from "@/lib/api/context";
import { error, json } from "@/lib/api/http";
import { createParty, listParties } from "@/lib/parties";

export { OPTIONS } from "@/lib/api/route-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    const customers = await listParties(ctx.orgId, "customer");
    return json({
      customers: customers.map((p) => ({
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

const createSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error("Invalid JSON body");
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const customer = await createParty(ctx.orgId, {
      name: parsed.data.name,
      type: "customer",
      phone: parsed.data.phone,
    });

    return json(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          type: customer.type,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}
