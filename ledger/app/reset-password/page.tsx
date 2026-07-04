import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-sm card-surface p-8">
        <BrandLogo href="/login" size="auth" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Set a new password</h1>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <p className="mt-2 text-sm text-red-600">
              This reset link is missing its token. Please request a new one.
            </p>
            <Link href="/forgot-password" className="btn-brand mt-6 block w-full text-center">
              Request a new link
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
