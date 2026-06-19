"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { createOrganizationWithOwner, SignupError } from "@/lib/org";

export type AuthState = { error?: string };

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required"),
  orgName: z.string().trim().min(1, "Company name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  baseCurrency: z.string().trim().min(3).max(3).default("XAF"),
});

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    orgName: formData.get("orgName"),
    email: formData.get("email"),
    password: formData.get("password"),
    baseCurrency: formData.get("baseCurrency") || "XAF",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { org, user } = await createOrganizationWithOwner(parsed.data);
    await createSession({ userId: user.id, orgId: org.id });
  } catch (err) {
    if (err instanceof SignupError) return { error: err.message };
    console.error(err);
    return { error: "Could not create account. Please try again." };
  }

  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }
  const membership = user.memberships[0];
  if (!membership) {
    return { error: "This account has no organization" };
  }

  await createSession({ userId: user.id, orgId: membership.orgId });
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
