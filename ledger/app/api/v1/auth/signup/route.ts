import { z } from "zod";

import { createOrganizationWithOwner, notifyNewMemberSignup, SignupError } from "@/lib/org";
import { sendUserVerification } from "@/lib/auth/account";
import { toE164 } from "@/lib/phone-e164";
import { error, json } from "@/lib/api/http";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export { OPTIONS } from "@/lib/api/route-options";

const signupSchema = z
  .object({
    name: z.string().trim().min(1),
    orgName: z.string().trim().min(1),
    email: z.string().trim().email(),
    confirmEmail: z.string().trim().email(),
    password: z.string().min(8),
    baseCurrency: z.string().trim().min(3).max(3).default("XAF"),
    phone: z.string().trim().min(1),
    whatsapp: z.string().trim().optional(),
  })
  .refine((data) => data.email.toLowerCase() === data.confirmEmail.toLowerCase(), {
    message: "Email addresses do not match",
    path: ["confirmEmail"],
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

  const phone = toE164(parsed.data.phone);
  if (!phone) return error("Enter a valid phone number");
  let whatsapp: string | null = null;
  if (parsed.data.whatsapp) {
    whatsapp = toE164(parsed.data.whatsapp);
    if (!whatsapp) return error("Enter a valid WhatsApp number");
  }

  const limit = await rateLimit(`signup:${requestIp(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return error("Too many sign-up attempts. Please try again later.", 429);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from the spread below
  const { confirmEmail, ...rest } = parsed.data;
  const signupFields = { ...rest, phone, whatsapp };

  try {
    const { user } = await createOrganizationWithOwner(signupFields);
    await sendUserVerification(user.id, user.email);
    await notifyNewMemberSignup(signupFields);

    // No auth token is issued here — accounts are gated behind email
    // confirmation (see app/actions/auth.ts's loginAction and
    // app/verify-email/route.ts), same as the web signup flow. A client of
    // this API must call POST /api/v1/auth/login after the user clicks the
    // emailed confirmation link, exactly like a web user would.
    return json(
      {
        status: "pending_verification",
        message: "Account created. Check your email to activate it before signing in.",
        user: { id: user.id, name: user.name, email: user.email },
      },
      201,
    );
  } catch (err) {
    if (err instanceof SignupError) return error(err.message);
    console.error(err);
    return error("Could not create account", 500);
  }
}
