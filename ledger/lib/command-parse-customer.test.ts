import { describe, expect, it } from "vitest";

import { parseBantooCommandText, resolvePeriodToRange } from "@/lib/command-parse";

describe("customer_action smoke", () => {
  it("edit", () => {
    expect(parseBantooCommandText("Edit customer Musa").customerAction).toMatchObject({
      kind: "edit",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Update customer Musa: phone 690123456").customerAction).toMatchObject({
      kind: "edit",
      customerName: "Musa",
      phone: "690123456",
    });
    expect(parseBantooCommandText("Update customer Musa: email musa@example.com").customerAction).toMatchObject({
      kind: "edit",
      customerName: "Musa",
      email: "musa@example.com",
    });
    expect(parseBantooCommandText("Modifier le client Musa").customerAction).toMatchObject({
      kind: "edit",
      customerName: "Musa",
    });
    expect(
      parseBantooCommandText("Modifier le client Musa : téléphone 690123456").customerAction,
    ).toMatchObject({ kind: "edit", customerName: "Musa", phone: "690123456" });
  });

  it("profile / search", () => {
    expect(parseBantooCommandText("Open Musa's profile").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Show customer profile for Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("View customer Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Ouvrir la fiche client de Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Afficher le profil du client Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Search customer Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Find customer Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Search customers").customerAction).toMatchObject({
      kind: "view_list",
    });
    expect(parseBantooCommandText("Rechercher client Musa").customerAction).toMatchObject({
      kind: "view_profile",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Rechercher des clients").customerAction).toMatchObject({
      kind: "view_list",
    });
  });

  it("ledger", () => {
    expect(parseBantooCommandText("Show Musa's ledger").customerAction).toMatchObject({
      kind: "view_ledger",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Open customer ledger for Musa").customerAction).toMatchObject({
      kind: "view_ledger",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("View Musa's transactions").customerAction).toMatchObject({
      kind: "view_ledger",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Afficher le grand livre client de Musa").customerAction).toMatchObject({
      kind: "view_ledger",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Voir les transactions de Musa").customerAction).toMatchObject({
      kind: "view_ledger",
      customerName: "Musa",
    });
  });

  it("balance", () => {
    expect(parseBantooCommandText("What is Musa's outstanding balance?").customerAction).toMatchObject({
      kind: "balance",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("How much does Musa owe?").customerAction).toMatchObject({
      kind: "balance",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Quel est le solde impayé de Musa ?").customerAction).toMatchObject({
      kind: "balance",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Combien Musa doit-il ?").customerAction).toMatchObject({
      kind: "balance",
      customerName: "Musa",
    });
  });

  it("statement", () => {
    expect(parseBantooCommandText("Generate customer statement for Musa").customerAction).toMatchObject({
      kind: "view_statement",
      customerName: "Musa",
      periodText: null,
    });
    expect(parseBantooCommandText("Show Musa's statement for June").customerAction).toMatchObject({
      kind: "view_statement",
      customerName: "Musa",
      periodText: "June",
    });
    expect(parseBantooCommandText("Customer statement for Musa").customerAction).toMatchObject({
      kind: "view_statement",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Générer le relevé client de Musa").customerAction).toMatchObject({
      kind: "view_statement",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Relevé client de Musa pour juin").customerAction).toMatchObject({
      kind: "view_statement",
      customerName: "Musa",
      periodText: "juin",
    });
  });

  it("documents", () => {
    expect(parseBantooCommandText("Show documents for customer Musa").customerAction).toMatchObject({
      kind: "view_documents",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Open Musa's documents").customerAction).toMatchObject({
      kind: "view_documents",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Afficher les documents du client Musa").customerAction).toMatchObject({
      kind: "view_documents",
      customerName: "Musa",
    });
  });

  it("add note", () => {
    expect(
      parseBantooCommandText("Add a note to customer Musa: prefers morning delivery").customerAction,
    ).toMatchObject({ kind: "add_note", customerName: "Musa", note: "prefers morning delivery" });
    expect(
      parseBantooCommandText("Ajouter une note pour le client Musa : préfère la livraison le matin")
        .customerAction,
    ).toMatchObject({ kind: "add_note", customerName: "Musa", note: "préfère la livraison le matin" });
  });

  it("unsupported: archive/reactivate/merge/upload", () => {
    expect(parseBantooCommandText("Archive customer Musa").customerAction).toMatchObject({
      kind: "unsupported_archive",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Archiver le client Musa").customerAction).toMatchObject({
      kind: "unsupported_archive",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Reactivate customer Musa").customerAction).toMatchObject({
      kind: "unsupported_reactivate",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Réactiver le client Musa").customerAction).toMatchObject({
      kind: "unsupported_reactivate",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Merge customers Musa and Musa Ibrahim").customerAction).toMatchObject({
      kind: "unsupported_merge",
      customerName: "Musa",
      secondCustomerName: "Musa Ibrahim",
    });
    expect(
      parseBantooCommandText("Fusionner les clients Musa et Musa Ibrahim").customerAction,
    ).toMatchObject({ kind: "unsupported_merge", customerName: "Musa", secondCustomerName: "Musa Ibrahim" });
  });

  it("contact: call/whatsapp/email", () => {
    expect(parseBantooCommandText("Call customer Musa").customerAction).toMatchObject({
      kind: "contact_call",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Appeler le client Musa").customerAction).toMatchObject({
      kind: "contact_call",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("WhatsApp customer Musa").customerAction).toMatchObject({
      kind: "contact_whatsapp",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Envoyer un WhatsApp au client Musa").customerAction).toMatchObject({
      kind: "contact_whatsapp",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Email customer Musa").customerAction).toMatchObject({
      kind: "contact_email",
      customerName: "Musa",
    });
    expect(parseBantooCommandText("Envoyer un email au client Musa").customerAction).toMatchObject({
      kind: "contact_email",
      customerName: "Musa",
    });
  });

  it("query", () => {
    expect(parseBantooCommandText("What did Musa buy last month?").customerAction).toMatchObject({
      kind: "query",
      customerName: "Musa",
      periodText: "last month",
    });
    expect(
      parseBantooCommandText("Qu'est-ce que Musa a acheté le mois dernier ?").customerAction,
    ).toMatchObject({ kind: "query", customerName: "Musa", periodText: "le mois dernier" });
  });

  it("does not misclassify supplier commands as customer actions", () => {
    expect(parseBantooCommandText("Call supplier Musa").customerAction).toBeNull();
    expect(parseBantooCommandText("Archive supplier Adamou").customerAction).toBeNull();
    expect(parseBantooCommandText("Email supplier Adamou").customerAction).toBeNull();
    expect(parseBantooCommandText("Show supplier ledger for Adamou").customerAction).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseBantooCommandText("ARCHIVE CUSTOMER MUSA").customerAction).toMatchObject({
      kind: "unsupported_archive",
    });
    expect(parseBantooCommandText("call CUSTOMER musa").customerAction).toMatchObject({
      kind: "contact_call",
      customerName: "musa",
    });
    expect(parseBantooCommandText("archiver LE CLIENT Musa").customerAction).toMatchObject({
      kind: "unsupported_archive",
    });
  });

  it("handles accented names and cities", () => {
    expect(parseBantooCommandText("Open customer ledger for Ngozi Ndjidda Élodie").customerAction).toMatchObject({
      kind: "view_ledger",
      customerName: "Ngozi Ndjidda Élodie",
    });
  });

  it("resolvePeriodToRange", () => {
    expect(resolvePeriodToRange("June", new Date("2026-07-07"))).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolvePeriodToRange("last month", new Date("2026-07-07"))).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolvePeriodToRange("le mois dernier", new Date("2026-01-15"))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolvePeriodToRange(null)).toEqual({ from: null, to: null });
  });
});
