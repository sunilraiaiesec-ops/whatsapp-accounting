import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { verifyEmail } from "@/lib/auth/account";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmail(token) : false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-sm card-surface p-8 text-center">
        <BrandLogo href="/login" size="auth" />
        {ok ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Email confirmed</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Thanks — your email address is now verified.
            </p>
            <Link href="/dashboard" className="btn-brand mt-6 block w-full text-center">
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Link expired</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This confirmation link is invalid or has already been used. You can request a new one
              from your dashboard.
            </p>
            <Link href="/dashboard" className="btn-brand mt-6 block w-full text-center">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
