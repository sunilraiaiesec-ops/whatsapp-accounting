import { describe, expect, it } from "vitest";

import { parseBantooCommandText } from "@/lib/command-parse";

describe("sales_action smoke", () => {
  it("invoice (credit sale)", () => {
    expect(parseBantooCommandText("Create an invoice for Musa for 50000").salesAction).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Invoice Musa 50000").salesAction).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
    });
    expect(
      parseBantooCommandText("Create an invoice for Musa for 50000, due in 30 days").salesAction,
    ).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
      dueDateDays: 30,
    });
    expect(parseBantooCommandText("Invoice Musa 50000 net 30").salesAction).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
      dueDateDays: 30,
    });
    expect(parseBantooCommandText("Créer une facture pour Musa de 50000").salesAction).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Facturer Musa 50000").salesAction).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
    });
    expect(
      parseBantooCommandText("Émettre une facture pour Musa de 50000, échéance dans 30 jours").salesAction,
    ).toMatchObject({
      kind: "invoice",
      customerName: "Musa",
      dueDateDays: 30,
    });
  });

  it("credit note", () => {
    expect(parseBantooCommandText("Issue a credit note for Musa for 5000").salesAction).toMatchObject({
      kind: "credit_note",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Credit note for Musa 5000").salesAction).toMatchObject({
      kind: "credit_note",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Issue a credit note of 5000 to Musa").salesAction).toMatchObject({
      kind: "credit_note",
      customerName: "Musa",
    });
    expect(
      parseBantooCommandText("Émettre une note de crédit pour Musa de 5000").salesAction,
    ).toMatchObject({
      kind: "credit_note",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Note de crédit pour Musa 5000").salesAction).toMatchObject({
      kind: "credit_note",
      customerName: "Musa",
    });
  });

  it("refund receipt", () => {
    expect(parseBantooCommandText("Issue a refund for Musa for 5000").salesAction).toMatchObject({
      kind: "refund",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Refund Musa 5000").salesAction).toMatchObject({
      kind: "refund",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Issue a refund of 5000 to Musa").salesAction).toMatchObject({
      kind: "refund",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Émettre un remboursement pour Musa de 5000").salesAction).toMatchObject(
      {
        kind: "refund",
        customerName: "Musa",
      },
    );
    expect(parseBantooCommandText("Rembourser Musa 5000").salesAction).toMatchObject({
      kind: "refund",
      customerName: "Musa",
    });
  });

  it("view sales invoices (list only)", () => {
    expect(parseBantooCommandText("View sales invoices").salesAction).toMatchObject({
      kind: "view_list",
    });
    expect(parseBantooCommandText("Show my invoices").salesAction).toMatchObject({
      kind: "view_list",
    });
    expect(parseBantooCommandText("List invoices").salesAction).toMatchObject({
      kind: "view_list",
    });
    expect(parseBantooCommandText("Voir les factures de vente").salesAction).toMatchObject({
      kind: "view_list",
    });
    expect(parseBantooCommandText("Afficher les factures").salesAction).toMatchObject({
      kind: "view_list",
    });
  });

  it("unsupported: edit/void/email/apply payment", () => {
    expect(parseBantooCommandText("Edit invoice INV-0001").salesAction).toMatchObject({
      kind: "unsupported_edit",
      invoiceNumber: "INV-0001",
    });
    expect(parseBantooCommandText("Modifier la facture FAC-0001").salesAction).toMatchObject({
      kind: "unsupported_edit",
      invoiceNumber: "FAC-0001",
    });
    expect(parseBantooCommandText("Void invoice INV-0001").salesAction).toMatchObject({
      kind: "unsupported_void",
      invoiceNumber: "INV-0001",
    });
    expect(parseBantooCommandText("Annuler la facture INV-0001").salesAction).toMatchObject({
      kind: "unsupported_void",
      invoiceNumber: "INV-0001",
    });
    expect(parseBantooCommandText("Email invoice INV-0001 to Musa").salesAction).toMatchObject({
      kind: "unsupported_email",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Envoyer la facture à Musa").salesAction).toMatchObject({
      kind: "unsupported_email",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Apply payment to invoice INV-0001").salesAction).toMatchObject({
      kind: "unsupported_apply_payment",
      invoiceNumber: "INV-0001",
    });
    expect(
      parseBantooCommandText("Appliquer un paiement à la facture INV-0001").salesAction,
    ).toMatchObject({
      kind: "unsupported_apply_payment",
      invoiceNumber: "INV-0001",
    });
  });

  it("does not misclassify customer/supplier/receipt/payment commands as sales actions", () => {
    expect(parseBantooCommandText("Call customer Musa").salesAction).toBeNull();
    expect(parseBantooCommandText("Call supplier Adamou").salesAction).toBeNull();
    expect(parseBantooCommandText("Received 20000 from Musa").salesAction).toBeNull();
    expect(parseBantooCommandText("Paid 45000 for tire change").salesAction).toBeNull();
    expect(parseBantooCommandText("Record a cash sale of 20000 from Musa").salesAction).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseBantooCommandText("CREATE AN INVOICE FOR MUSA FOR 50000").salesAction).toMatchObject({
      kind: "invoice",
    });
    expect(parseBantooCommandText("void INVOICE inv-0001").salesAction).toMatchObject({
      kind: "unsupported_void",
      invoiceNumber: "INV-0001",
    });
  });

  it("handles accented names", () => {
    expect(parseBantooCommandText("Invoice Élhadji Ndjidda 50000").salesAction).toMatchObject({
      kind: "invoice",
      customerName: "Élhadji Ndjidda",
    });
  });
});

describe("cash sale detection (create_receipt / sales_receipt coverage)", () => {
  it("classifies English cash sale phrasing as create_receipt with sales category", () => {
    const parsed = parseBantooCommandText("Record a cash sale of 20000 from Musa");
    expect(parsed.intent).toBe("create_receipt");
    expect(parsed.receiptCategory).toBe("sales");
    expect(parsed.partyName).toBe("Musa");
    expect(parsed.amountText).toBe("20000");
  });

  it("classifies French cash sale phrasing as create_receipt with sales category", () => {
    const parsed = parseBantooCommandText("Vente au comptant de 20000 à Musa");
    expect(parsed.intent).toBe("create_receipt");
    expect(parsed.receiptCategory).toBe("sales");
    expect(parsed.partyName).toBe("Musa");
    expect(parsed.amountText).toBe("20000");
  });

  it("still works without a customer name", () => {
    const parsed = parseBantooCommandText("Cash sale of 20000");
    expect(parsed.intent).toBe("create_receipt");
    expect(parsed.receiptCategory).toBe("sales");
    expect(parsed.amountText).toBe("20000");
  });
});
