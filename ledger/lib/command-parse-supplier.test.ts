import { describe, expect, it } from "vitest";

import { parseBantooCommandText } from "@/lib/command-parse";

describe("supplier_action smoke", () => {
  it("edit", () => {
    expect(parseBantooCommandText("Edit supplier Adamou").supplierAction).toMatchObject({
      kind: "edit",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Update supplier Adamou: phone 690123456").supplierAction).toMatchObject({
      kind: "edit",
      supplierName: "Adamou",
      phone: "690123456",
    });
    expect(parseBantooCommandText("Update supplier Adamou: email adamou@example.com").supplierAction).toMatchObject({
      kind: "edit",
      supplierName: "Adamou",
      email: "adamou@example.com",
    });
    expect(parseBantooCommandText("Modifier le fournisseur Adamou").supplierAction).toMatchObject({
      kind: "edit",
      supplierName: "Adamou",
    });
    expect(
      parseBantooCommandText("Modifier le fournisseur Adamou : téléphone 690123456").supplierAction,
    ).toMatchObject({ kind: "edit", supplierName: "Adamou", phone: "690123456" });
  });

  it("profile / search", () => {
    expect(parseBantooCommandText("Open supplier Adamou's profile").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Show supplier profile for Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("View supplier Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Ouvrir la fiche fournisseur de Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Afficher le profil du fournisseur Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Search supplier Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Find supplier Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Search suppliers").supplierAction).toMatchObject({
      kind: "view_list",
    });
    expect(parseBantooCommandText("Rechercher fournisseur Adamou").supplierAction).toMatchObject({
      kind: "view_profile",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Rechercher des fournisseurs").supplierAction).toMatchObject({
      kind: "view_list",
    });
  });

  it("ledger", () => {
    expect(parseBantooCommandText("Show supplier Adamou's ledger").supplierAction).toMatchObject({
      kind: "view_ledger",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Open supplier ledger for Adamou").supplierAction).toMatchObject({
      kind: "view_ledger",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("View supplier Adamou's transactions").supplierAction).toMatchObject({
      kind: "view_ledger",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Afficher le grand livre fournisseur de Adamou").supplierAction).toMatchObject({
      kind: "view_ledger",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Voir les transactions du fournisseur Adamou").supplierAction).toMatchObject({
      kind: "view_ledger",
      supplierName: "Adamou",
    });
  });

  it("balance (payable direction)", () => {
    expect(parseBantooCommandText("What's our balance with supplier Adamou?").supplierAction).toMatchObject({
      kind: "balance",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("How much do we owe supplier Adamou?").supplierAction).toMatchObject({
      kind: "balance",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Quel est notre solde avec le fournisseur Adamou ?").supplierAction).toMatchObject({
      kind: "balance",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Combien devons-nous au fournisseur Adamou ?").supplierAction).toMatchObject({
      kind: "balance",
      supplierName: "Adamou",
    });
  });

  it("documents", () => {
    expect(parseBantooCommandText("Show documents for supplier Adamou").supplierAction).toMatchObject({
      kind: "view_documents",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Open supplier Adamou's documents").supplierAction).toMatchObject({
      kind: "view_documents",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Afficher les documents du fournisseur Adamou").supplierAction).toMatchObject({
      kind: "view_documents",
      supplierName: "Adamou",
    });
  });

  it("add note", () => {
    expect(
      parseBantooCommandText("Add a note to supplier Adamou: delivers on Tuesdays").supplierAction,
    ).toMatchObject({ kind: "add_note", supplierName: "Adamou", note: "delivers on Tuesdays" });
    expect(
      parseBantooCommandText("Ajouter une note pour le fournisseur Adamou : livre le mardi").supplierAction,
    ).toMatchObject({ kind: "add_note", supplierName: "Adamou", note: "livre le mardi" });
  });

  it("unsupported: archive/reactivate/merge/upload", () => {
    expect(parseBantooCommandText("Archive supplier Adamou").supplierAction).toMatchObject({
      kind: "unsupported_archive",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Archiver le fournisseur Adamou").supplierAction).toMatchObject({
      kind: "unsupported_archive",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Reactivate supplier Adamou").supplierAction).toMatchObject({
      kind: "unsupported_reactivate",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Réactiver le fournisseur Adamou").supplierAction).toMatchObject({
      kind: "unsupported_reactivate",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Merge suppliers Adamou and Adamou Issa").supplierAction).toMatchObject({
      kind: "unsupported_merge",
      supplierName: "Adamou",
      secondSupplierName: "Adamou Issa",
    });
    expect(
      parseBantooCommandText("Fusionner les fournisseurs Adamou et Adamou Issa").supplierAction,
    ).toMatchObject({ kind: "unsupported_merge", supplierName: "Adamou", secondSupplierName: "Adamou Issa" });
  });

  it("contact: call/whatsapp/email", () => {
    expect(parseBantooCommandText("Call supplier Adamou").supplierAction).toMatchObject({
      kind: "contact_call",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Appeler le fournisseur Adamou").supplierAction).toMatchObject({
      kind: "contact_call",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("WhatsApp supplier Adamou").supplierAction).toMatchObject({
      kind: "contact_whatsapp",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Envoyer un WhatsApp au fournisseur Adamou").supplierAction).toMatchObject({
      kind: "contact_whatsapp",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Email supplier Adamou").supplierAction).toMatchObject({
      kind: "contact_email",
      supplierName: "Adamou",
    });
    expect(parseBantooCommandText("Envoyer un email au fournisseur Adamou").supplierAction).toMatchObject({
      kind: "contact_email",
      supplierName: "Adamou",
    });
  });

  it("query (purchasing intelligence)", () => {
    expect(
      parseBantooCommandText("What did we buy from supplier Elhaji last month?").supplierAction,
    ).toMatchObject({
      kind: "query",
      supplierName: "Elhaji",
      periodText: "last month",
    });
    expect(parseBantooCommandText("What did we buy from supplier Elhaji?").supplierAction).toMatchObject({
      kind: "query",
      supplierName: "Elhaji",
      periodText: null,
    });
    expect(
      parseBantooCommandText("Qu'avons-nous acheté chez le fournisseur Elhaji le mois dernier ?").supplierAction,
    ).toMatchObject({ kind: "query", supplierName: "Elhaji", periodText: "le mois dernier" });
  });

  it("does not misclassify customer commands as supplier actions", () => {
    expect(parseBantooCommandText("Call customer Adamou").supplierAction).toBeNull();
    expect(parseBantooCommandText("Archive customer Musa").supplierAction).toBeNull();
    expect(parseBantooCommandText("Email customer Musa").supplierAction).toBeNull();
    expect(parseBantooCommandText("Show customer ledger for Musa").supplierAction).toBeNull();
    expect(parseBantooCommandText("What did Musa buy last month?").supplierAction).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseBantooCommandText("ARCHIVE SUPPLIER ADAMOU").supplierAction).toMatchObject({
      kind: "unsupported_archive",
    });
    expect(parseBantooCommandText("call SUPPLIER adamou").supplierAction).toMatchObject({
      kind: "contact_call",
      supplierName: "adamou",
    });
    expect(parseBantooCommandText("archiver LE FOURNISSEUR Adamou").supplierAction).toMatchObject({
      kind: "unsupported_archive",
    });
  });

  it("handles accented names", () => {
    expect(parseBantooCommandText("Open supplier ledger for Élhadji Ndjidda").supplierAction).toMatchObject({
      kind: "view_ledger",
      supplierName: "Élhadji Ndjidda",
    });
  });
});
