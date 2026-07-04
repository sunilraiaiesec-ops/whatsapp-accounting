import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";

export const metadata = { title: "Privacy Policy · Bantoo Books" };

const UPDATED = "July 4, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <BrandLogo href="/login" size="auth" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-6 text-sm leading-6 text-slate-700">
        <section>
          <h2 className="text-base font-semibold text-slate-900">1. Who we are</h2>
          <p>
            Bantoo Books (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an online accounting
            application. This policy explains what information we collect, how we use it, and your
            choices.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">2. Information we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Account information:</strong> your name, email address, and the company name
              you register.
            </li>
            <li>
              <strong>Business &amp; financial data:</strong> the transactions, parties, accounts,
              and documents you enter into the Service.
            </li>
            <li>
              <strong>Technical data:</strong> basic logs such as IP address and timestamps, used for
              security, rate-limiting, and troubleshooting.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">3. How we use it</h2>
          <p>
            We use your information to provide and secure the Service, authenticate you, send
            essential account emails (such as email verification and password resets), and improve
            reliability. We do not sell your personal or financial data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">4. Data isolation</h2>
          <p>
            Each organization&apos;s data is logically separated. We take measures so that users can
            only access data belonging to organizations they are members of.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">5. Service providers</h2>
          <p>
            We rely on trusted third parties to run the Service, including cloud hosting and database
            providers and an email delivery provider. These providers process data on our behalf
            under their own security and privacy commitments.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">6. Retention</h2>
          <p>
            We retain Your Data for as long as your account is active. You can reset your
            organization&apos;s books from Settings, or request full deletion of your account and data
            by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">7. Security</h2>
          <p>
            Passwords are stored using industry-standard hashing (bcrypt). Sessions use signed,
            HTTP-only cookies. We apply rate-limiting to authentication endpoints. No system is
            perfectly secure, but we work to protect your information.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">8. Your rights</h2>
          <p>
            You may access, correct, export, or delete your information. To exercise these rights,
            use the in-app tools or contact us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">9. Contact</h2>
          <p>
            Questions about privacy? Contact us at{" "}
            <a href="mailto:support@bantoobooks.com" className="text-[var(--brand)] hover:underline">
              support@bantoobooks.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-[var(--border)] pt-6 text-sm">
        <Link href="/login" className="font-medium text-[var(--brand)] hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
