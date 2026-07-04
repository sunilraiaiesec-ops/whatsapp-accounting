import { z } from "zod";

import { createAuthToken } from "@/lib/auth/tokens";
import { createOrganizationWithOwner, SignupError } from "@/lib/org";
import { sendUserVerification } from "@/lib/auth/account";
import { error, json } from "@/lib/api/http";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export { OPTIONS } from "@/lib/api/route-options";

const signupSchema = z.object({
  name: z.string().trim().min(1),
  orgName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  baseCurrency: z.string().trim().min(3).max(3).default("XAF"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const limit = await rateLimit(`signup:${requestIp(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return error("Too many sign-up attempts. Please try again later.", 429);
  }

  try {
    const { org, user } = await createOrganizationWithOwner(parsed.data);
    await sendUserVerification(user.id, user.email);
    const token = await createAuthToken({ userId: user.id, orgId: org.id });

    return json(
      {
        token,
        user: { id: user.id, name: user.name, email: user.email },
        org: {
          id: org.id,
          name: org.name,
          baseCurrency: org.baseCurrency,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof SignupError) return error(err.message);
    console.error(err);
    return error("Could not create account", 500);
  }
}
