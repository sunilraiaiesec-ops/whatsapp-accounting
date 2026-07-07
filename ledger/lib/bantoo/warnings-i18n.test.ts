import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { BantooFieldReasonCode, BantooWarningCode } from "@/lib/bantoo/types";

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

function loadMessages(locale: "en" | "fr") {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, `../../messages/${locale}.json`), "utf8");
  return JSON.parse(raw) as {
    command: { warnings: Record<string, string>; fieldReasons: Record<string, string> };
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
  }
});
