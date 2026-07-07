import { requireContext } from "@/lib/auth/current";
import { chooseOnboardingAction } from "@/app/actions/onboarding";

export default async function OnboardingPage() {
  await requireContext();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          How are you starting?
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This tells BantooBooks whether to help you bring in your existing balances.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <form action={chooseOnboardingAction.bind(null, "new_business")}>
          <button
            type="submit"
            className="card-surface flex h-full w-full flex-col items-start gap-2 p-6 text-left transition hover:border-[var(--brand)] hover:shadow-md"
          >
            <span aria-hidden className="text-2xl">🌱</span>
            <span className="text-base font-semibold text-slate-900">Brand New Business</span>
            <span className="text-sm text-[var(--muted)]">
              I&apos;m just getting started — there are no prior balances to bring in. Take me straight to my dashboard.
            </span>
          </button>
        </form>

        <form action={chooseOnboardingAction.bind(null, "existing_business")}>
          <button
            type="submit"
            className="card-surface flex h-full w-full flex-col items-start gap-2 p-6 text-left transition hover:border-[var(--brand)] hover:shadow-md"
          >
            <span aria-hidden className="text-2xl">📚</span>
            <span className="text-base font-semibold text-slate-900">Existing Business</span>
            <span className="text-sm text-[var(--muted)]">
              I already run this business and have balances, customers, suppliers or stock to bring in. Guide me through the Migration Wizard.
            </span>
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--muted)]">
        You can always reopen this later from Settings → Migration → Opening Balances.
      </p>
    </div>
  );
}
