import { requireContext } from "@/lib/auth/current";
import { isAdminRole, loadWizardState, toClientState } from "@/lib/migration/wizard";
import { MigrationWizardApp } from "@/components/migration/MigrationWizardApp";
import { MigrationCompletedSummary } from "@/components/migration/MigrationCompletedSummary";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function MigrationWizardPage() {
  const ctx = await requireContext();
  const isAdmin = isAdminRole(ctx.role);
  const state = await loadWizardState(ctx.orgId);
  const client = toClientState(state, ctx.baseCurrency, isAdmin);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Migration & Opening Balance Wizard"
        subtitle="Bring in your balances from your previous accounting system."
      />

      {client.wizard.status === "completed" ? (
        <MigrationCompletedSummary initialState={client} />
      ) : (
        <MigrationWizardApp initialState={client} />
      )}
    </div>
  );
}
