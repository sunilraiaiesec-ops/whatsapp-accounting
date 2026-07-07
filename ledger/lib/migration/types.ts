// Shared shapes for the Migration & Opening Balance Wizard.
//
// Internal (server-side) types use `bigint` for money, matching the rest of
// the codebase's minor-units convention (lib/money.ts). Client-safe types
// use `string` for every bigint field, because React Server Component/server
// action payloads must be JSON-serializable — the boundary conversion always
// happens in lib/migration/wizard.ts's `toClientState`.

export type WizardStatus = "not_started" | "in_progress" | "completed";

export type AccountSummary = {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  subtype: string | null;
  isControl: boolean;
  currency: string | null;
};

export type PartySummary = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
};

export type InventoryItemSummary = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
};

// --- Internal (bigint) staging rows -----------------------------------------

export type OpeningBalanceRow = { accountId: string; amount: bigint };
export type BankBalanceRow = { accountId: string; amount: bigint };
export type CustomerBalanceRow = { partyId: string; amount: bigint };
export type SupplierBalanceRow = { partyId: string; amount: bigint };
export type InventoryBalanceRow = {
  itemId: string;
  quantity: string; // decimal string, e.g. "12.5"
  unit: string | null;
  unitCost: bigint;
  totalValue: bigint;
  warehouse: string | null;
};

export type WizardCore = {
  id: string;
  orgId: string;
  status: WizardStatus;
  currentStep: number;
  openingDate: string | null; // ISO yyyy-mm-dd
  completedAt: string | null;
  completedById: string | null;
};

export type WizardState = {
  wizard: WizardCore;
  accounts: AccountSummary[];
  customers: PartySummary[];
  suppliers: PartySummary[];
  items: InventoryItemSummary[];
  openingBalances: OpeningBalanceRow[];
  bankBalances: BankBalanceRow[];
  customerBalances: CustomerBalanceRow[];
  supplierBalances: SupplierBalanceRow[];
  inventoryBalances: InventoryBalanceRow[];
  acknowledgedWarnings: string[];
};

// --- Client-safe (string money) mirror --------------------------------------

export type ClientOpeningBalanceRow = { accountId: string; amount: string };
export type ClientBankBalanceRow = { accountId: string; amount: string };
export type ClientCustomerBalanceRow = { partyId: string; amount: string };
export type ClientSupplierBalanceRow = { partyId: string; amount: string };
export type ClientInventoryBalanceRow = {
  itemId: string;
  quantity: string;
  unit: string | null;
  unitCost: string;
  totalValue: string;
  warehouse: string | null;
};

export type ClientWizardState = {
  wizard: WizardCore;
  accounts: AccountSummary[];
  customers: PartySummary[];
  suppliers: PartySummary[];
  items: InventoryItemSummary[];
  openingBalances: ClientOpeningBalanceRow[];
  bankBalances: ClientBankBalanceRow[];
  customerBalances: ClientCustomerBalanceRow[];
  supplierBalances: ClientSupplierBalanceRow[];
  inventoryBalances: ClientInventoryBalanceRow[];
  acknowledgedWarnings: string[];
  currency: string;
  isAdmin: boolean;
};

export const WIZARD_STEP_COUNT = 7;
