import type { BantooActionType } from "@/lib/ai/actions";

// Types shared between the server (extraction/resolution/execution) and the
// Ask Bantoo client modal. This module MUST stay free of server-only imports
// (prisma, next/headers, etc.) so the client bundle can import the types.

export type BantooOption = { id: string; label: string };

// The flat, editable representation of an extracted action. Every value is a
// string so it maps directly to text inputs in the confirmation form. Empty
// string means "not set". Money/number fields are in MAJOR units as typed.
export type BantooDraft = {
  productName: string;
  barcode: string;
  sku: string;
  category: string;
  unit: string;
  quantity: string;
  costPrice: string;
  salePrice: string;
  taxRate: string;
  reorderLevel: string;
  amount: string;
  partyName: string;
  paymentMethod: string;
  description: string;
  date: string;
  currency: string;
};

// The proposal returned to the client after AI extraction + org-scoped
// resolution. Mirrors the style of CommandProposalDto but covers the new
// action types and carries the resolution options the confirm form needs.
export type BantooProposal = {
  action: BantooActionType;
  confidence: number;
  lowConfidence: boolean;
  summary: string;
  warnings: string[];
  draft: BantooDraft;
  partyType: "customer" | "supplier" | null;
  partyId: string | null;
  createParty: boolean;
  partyOptions: BantooOption[];
  itemId: string | null;
  itemOptions: BantooOption[];
  bankAccountId: string | null;
  bankOptions: BantooOption[];
  lineAccountId: string | null;
  lineAccountOptions: BantooOption[];
  needsItem: boolean;
  needsParty: boolean;
  needsBank: boolean;
  needsLineAccount: boolean;
};

// What the client sends back on Confirm. The server re-validates everything and
// never trusts these values blindly.
export type ExecuteBantooInput = {
  action: BantooActionType;
  draft: BantooDraft;
  partyId: string | null;
  createParty: boolean;
  partyType: "customer" | "supplier" | null;
  itemId: string | null;
  bankAccountId: string | null;
  lineAccountId: string | null;
};

export type BantooExecuteResult =
  | { ok: true; href: string; number: string; kind: BantooActionType }
  | { ok: false; error: string };

export function emptyDraft(): BantooDraft {
  return {
    productName: "",
    barcode: "",
    sku: "",
    category: "",
    unit: "",
    quantity: "",
    costPrice: "",
    salePrice: "",
    taxRate: "",
    reorderLevel: "",
    amount: "",
    partyName: "",
    paymentMethod: "",
    description: "",
    date: "",
    currency: "XAF",
  };
}
