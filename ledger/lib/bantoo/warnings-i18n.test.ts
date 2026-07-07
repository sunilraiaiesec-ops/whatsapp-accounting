import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { BantooFieldReasonCode, BantooPlanStepCode, BantooWarningCode } from "@/lib/bantoo/types";

const WARNING_CODES: BantooWarningCode[] = [
  "barcodeDuplicateReceiveStock",
  "similarItemReceiveStock",
  "enterProductName",
  "openingStockNeedsCost",
  "itemNotInInventory",
  "chooseInventoryItem",
  "chooseSupplier",
  "enterQuantity",
  "enterUnitCost",
  "chooseSupplierForBill",
  "enterInvoiceTotal",
  "noExpensePurchasesAccount",
  "chooseCustomer",
  "enterAmountReceived",
  "noBankAccount",
  "enterAmountPaid",
  "noExpenseAccount",
  "enterSaleAmount",
  "noIncomeAccount",
  "enterCustomerName",
  "lowConfidence",
  // --- Customer Intelligence Sprint --------------------------------------
  "customerNotFound",
  "customerAmbiguous",
  "noChangesToSave",
  "enterNoteText",
  "missingPhone",
  "missingWhatsapp",
  "missingEmail",
  "notYetAvailable",
  "possibleDuplicateCustomer",
  // --- Supplier & Purchasing Intelligence Sprint -------------------------
  "supplierNotFound",
  "supplierAmbiguous",
  "enterSupplierName",
  "supplierMissingPhone",
  "supplierMissingWhatsapp",
  "supplierMissingEmail",
];

const FIELD_REASON_CODES: BantooFieldReasonCode[] = [
  "supplierProductHistory",
  "itemDeliveryHistory",
  "itemBestMatch",
  "quantityUsual",
  "quantityLastDelivery",
  "costLastPurchase",
  "dueDatePaymentTerms",
];

// Multi-step Task Planning: every plan-step label the checklist UI can
// render (see BantooCommand.tsx's planBlock). "unsupportedStep" and
// "notAvailableYet" are checked too since they're the same `command.plan.*`
// catalog, just not a BantooPlanStepCode value.
const PLAN_STEP_CODES: BantooPlanStepCode[] = [
  "createCustomer",
  "editCustomer",
  "setCity",
  "setPhone",
  "setWhatsapp",
  "setNote",
  "openProfile",
  "unsupportedStep",
];

function loadMessages(locale: "en" | "fr") {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, `../../messages/${locale}.json`), "utf8");
  return JSON.parse(raw) as {
    command: {
      warnings: Record<string, string>;
      fieldReasons: Record<string, string>;
      plan: Record<string, string>;
      duplicateCustomer: Record<string, string>;
    };
  };
}

describe("Bantoo warning i18n catalogs", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`defines every warning code in ${locale}.json`, () => {
      const messages = loadMessages(locale);
      for (const code of WARNING_CODES) {
        expect(messages.command.warnings[code]).toBeTruthy();
      }
    });

    it(`defines every field-reason code in ${locale}.json`, () => {
      const messages = loadMessages(locale);
      for (const code of FIELD_REASON_CODES) {
        expect(messages.command.fieldReasons[code]).toBeTruthy();
      }
    });

    it(`defines every plan-step code plus title/notAvailableYet in ${locale}.json`, () => {
      const messages = loadMessages(locale);
      expect(messages.command.plan.title).toBeTruthy();
      expect(messages.command.plan.notAvailableYet).toBeTruthy();
      for (const code of PLAN_STEP_CODES) {
        expect(messages.command.plan[code]).toBeTruthy();
      }
    });

    it(`defines the duplicate-customer choice copy in ${locale}.json`, () => {
      const messages = loadMessages(locale);
      expect(messages.command.duplicateCustomer.title).toBeTruthy();
      expect(messages.command.duplicateCustomer.useExisting).toBeTruthy();
      expect(messages.command.duplicateCustomer.createNew).toBeTruthy();
    });
  }
});
