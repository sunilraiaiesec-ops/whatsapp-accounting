"""English / French copy for WhatsApp accounting flows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

LANG_EN = "en"
LANG_FR = "fr"
DEFAULT_LANG = LANG_EN

_FRENCH_GREETINGS = {
    "bonjour", "salut", "bonsoir", "coucou", "bjr",
}
_ENGLISH_GREETINGS = {
    "hello", "hi", "hey", "hola",
}


def detect_language_from_greeting(text: str) -> str:
    normalized = text.strip().lower().strip("!.,?")
    if not normalized:
        return DEFAULT_LANG
    if normalized.startswith("bonne ") or normalized.startswith("good "):
        return LANG_FR if normalized.startswith("bonne") else LANG_EN
    words = normalized.split()
    for word in words:
        if word in _FRENCH_GREETINGS:
            return LANG_FR
    for word in words:
        if word in _ENGLISH_GREETINGS:
            return LANG_EN
    return DEFAULT_LANG


def get_session_lang(session: dict | None) -> str:
    if not session:
        return DEFAULT_LANG
    lang = (session.get("flow_data") or {}).get("lang")
    return lang if lang in (LANG_EN, LANG_FR) else DEFAULT_LANG


@dataclass(frozen=True)
class PromptBundle:
    master_menu: str
    master_menu_admin: str
    ask_pin: str
    wrong_pin: str
    cr_amount: str
    picker_client: str
    cr_location: str
    cr_proof: str
    cr_justification: str
    ex_amount: str
    ex_category: str
    picker_expense_party: str
    ex_proof: str
    ex_justification: str
    tr_truck: str
    picker_tr_client: str
    tr_document: str
    tr_status: str
    tr_shortage: str
    tr_proof: str
    bk_type: str
    bk_amount: str
    bk_proof_deposit: str
    bk_proof_withdraw: str
    sp_type: str
    picker_supplier: str
    sp_amount: str
    sp_proof: str
    ap_type: str
    ap_name: str
    ap_saved: str
    err_amount: str
    err_choice: str
    err_text_required: str
    err_photo_required: str
    err_photo_or_zero: str
    err_unexpected_photo: str
    err_party_picker: str
    err_add_party_denied: str
    menu_hint: str
    menu_hint_admin: str
    location_labels: dict[str, str]
    expense_categories: dict[str, str]
    bank_types: dict[str, str]
    supplier_types: dict[str, str]
    add_party_type_labels: dict[str, tuple[str, str]]
    loading_status_labels: dict[str, str]
    summary_cash_received: Callable[[dict], str]
    summary_expense: Callable[[dict], str]
    summary_truck: Callable[[dict], str]
    summary_bank: Callable[[dict], str]
    summary_supplier: Callable[[dict], str]
    party_search_hint: str
    party_search_footer: str
    party_matches_for: str
    party_refine: str
    party_no_match: str
    party_no_match_hint: str
    party_browse_label: str
    party_add_new: str
    party_browse_title: str
    party_browse_footer: str
    party_browse_type_search: str
    party_empty_list: str
    party_empty_non_admin: str
    party_reply_number: str
    saved_header: str
    saved_footer: str
    saved_logged_by: str

    def format_master_menu(self, name: str, *, admin: bool = False) -> str:
        template = self.master_menu_admin if admin else self.master_menu
        return template.format(name=name)

    def format_saved(self, receipt_id: str, summary: str, employee_name: str) -> str:
        return (
            f"{self.saved_header.format(receipt_id=receipt_id)}\n"
            f"{summary}\n"
            f"{self.saved_logged_by.format(name=employee_name)}\n\n"
            f"{self.saved_footer}"
        )

    def format_ask_pin(self, employee_name: str, company_name: str) -> str:
        return self.ask_pin.format(name=employee_name, company=company_name)


PROMPTS_EN = PromptBundle(
    master_menu="""Thanks {name}. What do you want to do?

1 — 💰 Cash Received (Sales Collection)
2 — 🛑 Cash Expense Made (Outflow)
3 — 🚚 Truck Loading & Delivery Note
4 — 🏦 Bank Deposit / Withdrawal
5 — 🚢 Supplier & Port Payment Confirmation
0 — ❌ Cancel / Start Over

Reply 1–5, or 0 to cancel a step back to this menu.
Send *Bonjour* (French) or *Hello*/*Hi* (English) anytime to restart from the PIN.""",
    master_menu_admin="""Thanks {name}. What do you want to do?

1 — 💰 Cash Received (Sales Collection)
2 — 🛑 Cash Expense Made (Outflow)
3 — 🚚 Truck Loading & Delivery Note
4 — 🏦 Bank Deposit / Withdrawal
5 — 🚢 Supplier & Port Payment Confirmation
6 — ➕ Add Client / Supplier (Admin)
0 — ❌ Cancel / Start Over

Reply 1–6, or 0 to cancel a step back to this menu.
Send *Bonjour* (French) or *Hello*/*Hi* (English) anytime to restart from the PIN.""",
    ask_pin=(
        "Hello {name}, welcome to the {company} Accounting Assistant.\n"
        "Please enter your 6-digit PIN to continue."
    ),
    wrong_pin=(
        "⛔ Wrong PIN.\n"
        "Please enter the correct 6-digit PIN from the owner."
    ),
    cr_amount="Please enter the total amount of physical cash collected (Numbers only).",
    picker_client="Who is the client (buyer)?",
    cr_location=(
        "Where is this cash held?\n"
        "Reply 1 (My Possession), 2 (Warehouse Safe), 3 (Handed to Govind)."
    ),
    cr_proof=(
        "Please upload a photo of the Delivery Note, Invoice, or Receipt.\n"
        "Or type 0 if missing."
    ),
    cr_justification="Please type a brief reason why paperwork is missing.",
    ex_amount="Enter total cash paid out (Numbers only).",
    ex_category=(
        "Select category:\n"
        "1 (Fuel), 2 (Warehouse/Logistics), 3 (Labor),\n"
        "4 (Food/Refreshments), 5 (Customs/Admin), 6 (Other)."
    ),
    picker_expense_party="Who is the supplier or facility for this expense?",
    ex_proof="Please upload a sharp photo of the physical receipt, or type 0 if missing.",
    ex_justification="Please type a brief reason why paperwork is missing.",
    tr_truck="Enter the Truck License Plate Number or Driver Name.",
    picker_tr_client="Who is the client for this delivery?",
    tr_document="Enter the associated Delivery Order (DO) or Invoice Number.",
    tr_status="Select loading status: 1 (Fully Loaded), 2 (Partial Loading / Shortage).",
    tr_shortage="Type what items or quantities were short-loaded.",
    tr_proof="Please upload a photo of the signed Delivery Note (Bon de Livraison).",
    bk_type="Select action: 1 (Cash to Bank Deposit), 2 (Bank to Cash Withdrawal).",
    bk_amount="Enter the total transaction amount (Numbers only).",
    bk_proof_deposit="Upload a photo of the stamped bank deposit slip (bordereau).",
    bk_proof_withdraw="Upload check stub photo or ATM receipt.",
    sp_type=(
        "Select payment type:\n"
        "1 (International Food Import Supplier),\n"
        "2 (Local Port / Customs Fees), 3 (Other)."
    ),
    picker_supplier="Who is the supplier?",
    sp_amount="Enter total amount paid out from the bank account (Numbers only).",
    sp_proof="Upload a photo/screenshot of the bank transfer confirmation or remittance advice.",
    ap_type=(
        "Add new name — select type:\n"
        "1 — Client (buyer)\n"
        "2 — Supplier\n"
        "3 — Facility (expense location)"
    ),
    ap_name="Type the exact name to save (spelling will be used in all reports):",
    ap_saved="✅ Added *{name}* as {type_label}.\nIt is now available for everyone to select.",
    err_amount="⚠️ Please enter numbers only (e.g. 50000). Try again.",
    err_choice="⚠️ Invalid choice. {hint}",
    err_text_required="⚠️ Please type a short answer. Try again.",
    err_photo_required="⚠️ Please send a photo (camera icon), not text.",
    err_photo_or_zero="⚠️ Send a photo, or type 0 if paperwork is missing.",
    err_unexpected_photo="⚠️ A photo is not expected right now.\n\n{prompt}",
    err_party_picker="⚠️ Reply with a number from the list{extra}.",
    err_add_party_denied=(
        "⛔ Only Govind, Vikash, or owners can add new clients/suppliers.\n"
        "Please pick from the list or ask them to add the name."
    ),
    menu_hint="Reply 1–5 to choose, or 0 to start over.",
    menu_hint_admin="Reply 1–6 to choose, or 0 to start over.",
    location_labels={
        "1": "My Possession",
        "2": "Warehouse Safe",
        "3": "Handed to Govind",
    },
    expense_categories={
        "1": "Fuel",
        "2": "Warehouse/Logistics",
        "3": "Labor",
        "4": "Food/Refreshments",
        "5": "Customs/Admin",
        "6": "Other",
    },
    bank_types={
        "1": "Cash to Bank Deposit",
        "2": "Bank to Cash Withdrawal",
    },
    supplier_types={
        "1": "International Food Import Supplier",
        "2": "Local Port / Customs Fees",
        "3": "Other",
    },
    add_party_type_labels={
        "1": ("customer", "Client (buyer)"),
        "2": ("supplier", "Supplier"),
        "3": ("facility", "Facility (expense location)"),
    },
    loading_status_labels={
        "1": "Fully Loaded",
        "2": "Partial Loading / Shortage",
    },
    summary_cash_received=lambda d: (
        f"💰 Cash Received: {d.get('amount', 0):,} FCFA\n"
        f"Client: {d.get('client', '—')}\n"
        f"Location: {d.get('location', '—')}"
        + (f"\nNote: {d.get('missing_paperwork_reason', '—')}" if d.get("proof_skipped") else "")
    ),
    summary_expense=lambda d: (
        f"🛑 Expense: {d.get('amount', 0):,} FCFA\n"
        f"Category: {d.get('category', '—')}\n"
        f"Supplier/Facility: {d.get('expense_party', '—')}"
        + (f"\nNote: {d.get('missing_paperwork_reason', '—')}" if d.get("proof_skipped") else "")
    ),
    summary_truck=lambda d: (
        f"🚚 Truck/Delivery: {d.get('truck_id', '—')}\n"
        f"Client: {d.get('client', '—')}\n"
        f"DO/Invoice: {d.get('document_id', '—')}\n"
        f"Status: {d.get('loading_status', '—')}"
        + (f"\nShortage: {d['shortage_details']}" if d.get("shortage_details") else "")
    ),
    summary_bank=lambda d: (
        f"🏦 Bank: {d.get('bank_action', '—')}\n"
        f"Amount: {d.get('amount', 0):,} FCFA"
    ),
    summary_supplier=lambda d: (
        f"🚢 Supplier payment: {d.get('payment_type', '—')}\n"
        f"Supplier: {d.get('supplier', '—')}\n"
        f"Amount: {d.get('amount', 0):,} FCFA"
    ),
    party_search_hint=(
        "Type part of the name to search (e.g. *Hayatou*, *Abesso*, *Douala*).\n"
        "Spelling can be approximate — we show the closest matches."
    ),
    party_search_footer="Reply with the name to search, or a number after matches appear.",
    party_matches_for='Matches for "{query}":',
    party_refine="Type more letters to refine, or pick a number above.",
    party_no_match='No close match for "{query}".',
    party_no_match_hint=(
        "Try a shorter name, different spelling, or one word at a time.\n"
        "Example: *Abesso* instead of *Ahmed Abesso*."
    ),
    party_browse_label="Browse full A–Z list",
    party_add_new="➕ Add new name (admin)",
    party_browse_title="Full list (A–Z):",
    party_browse_footer="Type a name anytime to search instead.",
    party_browse_type_search="Type a name anytime to search instead.",
    party_empty_list="No names in the list yet.",
    party_empty_non_admin="Ask Govind, Vikash, or an owner to add clients/suppliers.",
    party_reply_number="Reply with the number.",
    saved_header="✅ Transaction added to the system — Receipt #{receipt_id}",
    saved_footer="Reply 0 to return to the main menu.",
    saved_logged_by="Logged by: {name}",
)

PROMPTS_FR = PromptBundle(
    master_menu="""Merci {name}. Que voulez-vous faire ?

1 — 💰 Encaissement (vente)
2 — 🛑 Dépense en espèces
3 — 🚚 Chargement camion / Bon de livraison
4 — 🏦 Dépôt / Retrait bancaire
5 — 🚢 Paiement fournisseur / port
0 — ❌ Annuler / Recommencer

Répondez 1–5, ou 0 pour annuler une étape et revenir ici.
Envoyez *Bonjour* (français) ou *Hello*/*Hi* (anglais) pour tout recommencer depuis le PIN.""",
    master_menu_admin="""Merci {name}. Que voulez-vous faire ?

1 — 💰 Encaissement (vente)
2 — 🛑 Dépense en espèces
3 — 🚚 Chargement camion / Bon de livraison
4 — 🏦 Dépôt / Retrait bancaire
5 — 🚢 Paiement fournisseur / port
6 — ➕ Ajouter client / fournisseur (Admin)
0 — ❌ Annuler / Recommencer

Répondez 1–6, ou 0 pour annuler une étape et revenir ici.
Envoyez *Bonjour* (français) ou *Hello*/*Hi* (anglais) pour tout recommencer depuis le PIN.""",
    ask_pin=(
        "Bonjour {name}, bienvenue dans l'assistant comptable {company}.\n"
        "Veuillez saisir votre code PIN à 6 chiffres pour continuer."
    ),
    wrong_pin=(
        "⛔ Code PIN incorrect.\n"
        "Veuillez saisir le code PIN à 6 chiffres fourni par le propriétaire."
    ),
    cr_amount="Veuillez saisir le montant total des espèces collectées (chiffres uniquement).",
    picker_client="Quel est le client (acheteur) ?",
    cr_location=(
        "Où sont conservées ces espèces ?\n"
        "Répondez 1 (En ma possession), 2 (Coffre entrepôt), 3 (Remis à Govind)."
    ),
    cr_proof=(
        "Veuillez envoyer une photo du bon de livraison, facture ou reçu.\n"
        "Ou tapez 0 si absent."
    ),
    cr_justification="Veuillez indiquer brièvement pourquoi le justificatif est absent.",
    ex_amount="Saisissez le montant total payé en espèces (chiffres uniquement).",
    ex_category=(
        "Choisissez la catégorie :\n"
        "1 (Carburant), 2 (Entrepôt/Logistique), 3 (Main-d'œuvre),\n"
        "4 (Nourriture/Rafraîchissements), 5 (Douane/Admin), 6 (Autre)."
    ),
    picker_expense_party="Quel est le fournisseur ou le lieu de cette dépense ?",
    ex_proof="Envoyez une photo nette du reçu, ou tapez 0 si absent.",
    ex_justification="Veuillez indiquer brièvement pourquoi le justificatif est absent.",
    tr_truck="Saisissez la plaque du camion ou le nom du chauffeur.",
    picker_tr_client="Quel est le client pour cette livraison ?",
    tr_document="Saisissez le numéro de bon de livraison (BL) ou de facture.",
    tr_status="Statut du chargement : 1 (Chargé complet), 2 (Chargement partiel / manquant).",
    tr_shortage="Indiquez les articles ou quantités manquants.",
    tr_proof="Veuillez envoyer une photo du bon de livraison signé.",
    bk_type="Choisissez l'action : 1 (Dépôt espèces en banque), 2 (Retrait espèces banque).",
    bk_amount="Saisissez le montant total de l'opération (chiffres uniquement).",
    bk_proof_deposit="Envoyez une photo du bordereau de dépôt bancaire tamponné.",
    bk_proof_withdraw="Envoyez une photo du chèque ou du reçu guichet automatique.",
    sp_type=(
        "Choisissez le type de paiement :\n"
        "1 (Fournisseur import alimentaire international),\n"
        "2 (Frais port/douane local), 3 (Autre)."
    ),
    picker_supplier="Quel est le fournisseur ?",
    sp_amount="Saisissez le montant payé depuis le compte bancaire (chiffres uniquement).",
    sp_proof="Envoyez une photo/capture de la confirmation de virement bancaire.",
    ap_type=(
        "Ajouter un nom — choisissez le type :\n"
        "1 — Client (acheteur)\n"
        "2 — Fournisseur\n"
        "3 — Lieu (dépense)"
    ),
    ap_name="Saisissez le nom exact à enregistrer (l'orthographe sera utilisée dans tous les rapports) :",
    ap_saved="✅ *{name}* ajouté comme {type_label}.\nDisponible pour tout le monde.",
    err_amount="⚠️ Veuillez saisir des chiffres uniquement (ex. 50000). Réessayez.",
    err_choice="⚠️ Choix invalide. {hint}",
    err_text_required="⚠️ Veuillez saisir une courte réponse. Réessayez.",
    err_photo_required="⚠️ Veuillez envoyer une photo (icône appareil photo), pas du texte.",
    err_photo_or_zero="⚠️ Envoyez une photo, ou tapez 0 si le justificatif est absent.",
    err_unexpected_photo="⚠️ Une photo n'est pas attendue pour le moment.\n\n{prompt}",
    err_party_picker="⚠️ Répondez avec un numéro de la liste{extra}.",
    err_add_party_denied=(
        "⛔ Seuls Govind, Vikash ou les propriétaires peuvent ajouter des noms.\n"
        "Choisissez dans la liste ou demandez-leur d'ajouter le nom."
    ),
    menu_hint="Répondez 1–5 pour choisir, ou 0 pour recommencer.",
    menu_hint_admin="Répondez 1–6 pour choisir, ou 0 pour recommencer.",
    location_labels={
        "1": "En ma possession",
        "2": "Coffre entrepôt",
        "3": "Remis à Govind",
    },
    expense_categories={
        "1": "Carburant",
        "2": "Entrepôt/Logistique",
        "3": "Main-d'œuvre",
        "4": "Nourriture/Rafraîchissements",
        "5": "Douane/Admin",
        "6": "Autre",
    },
    bank_types={
        "1": "Dépôt espèces en banque",
        "2": "Retrait espèces banque",
    },
    supplier_types={
        "1": "Fournisseur import alimentaire international",
        "2": "Frais port/douane local",
        "3": "Autre",
    },
    add_party_type_labels={
        "1": ("customer", "Client (acheteur)"),
        "2": ("supplier", "Fournisseur"),
        "3": ("facility", "Lieu (dépense)"),
    },
    loading_status_labels={
        "1": "Chargé complet",
        "2": "Chargement partiel / manquant",
    },
    summary_cash_received=lambda d: (
        f"💰 Encaissement : {d.get('amount', 0):,} FCFA\n"
        f"Client : {d.get('client', '—')}\n"
        f"Lieu : {d.get('location', '—')}"
        + (f"\nNote : {d.get('missing_paperwork_reason', '—')}" if d.get("proof_skipped") else "")
    ),
    summary_expense=lambda d: (
        f"🛑 Dépense : {d.get('amount', 0):,} FCFA\n"
        f"Catégorie : {d.get('category', '—')}\n"
        f"Fournisseur/Lieu : {d.get('expense_party', '—')}"
        + (f"\nNote : {d.get('missing_paperwork_reason', '—')}" if d.get("proof_skipped") else "")
    ),
    summary_truck=lambda d: (
        f"🚚 Camion/Livraison : {d.get('truck_id', '—')}\n"
        f"Client : {d.get('client', '—')}\n"
        f"BL/Facture : {d.get('document_id', '—')}\n"
        f"Statut : {d.get('loading_status', '—')}"
        + (f"\nManquant : {d['shortage_details']}" if d.get("shortage_details") else "")
    ),
    summary_bank=lambda d: (
        f"🏦 Banque : {d.get('bank_action', '—')}\n"
        f"Montant : {d.get('amount', 0):,} FCFA"
    ),
    summary_supplier=lambda d: (
        f"🚢 Paiement fournisseur : {d.get('payment_type', '—')}\n"
        f"Fournisseur : {d.get('supplier', '—')}\n"
        f"Montant : {d.get('amount', 0):,} FCFA"
    ),
    party_search_hint=(
        "Tapez une partie du nom (ex. *Hayatou*, *Abesso*, *Douala*).\n"
        "L'orthographe peut être approximative — nous affichons les correspondances les plus proches."
    ),
    party_search_footer="Répondez avec le nom à rechercher, ou un numéro après les résultats.",
    party_matches_for='Résultats pour « {query} » :',
    party_refine="Tapez plus de lettres pour affiner, ou choisissez un numéro ci-dessus.",
    party_no_match='Aucune correspondance proche pour « {query} ».',
    party_no_match_hint=(
        "Essayez un nom plus court, une autre orthographe, ou un mot à la fois.\n"
        "Exemple : *Abesso* au lieu de *Ahmed Abesso*."
    ),
    party_browse_label="Parcourir la liste A–Z complète",
    party_add_new="➕ Ajouter un nom (admin)",
    party_browse_title="Liste complète (A–Z) :",
    party_browse_footer="Tapez un nom à tout moment pour rechercher.",
    party_browse_type_search="Tapez un nom à tout moment pour rechercher.",
    party_empty_list="Aucun nom dans la liste pour le moment.",
    party_empty_non_admin="Demandez à Govind, Vikash ou un propriétaire d'ajouter des noms.",
    party_reply_number="Répondez avec le numéro.",
    saved_header="✅ Transaction enregistrée dans le système — Reçu #{receipt_id}",
    saved_footer="Répondez 0 pour revenir au menu principal.",
    saved_logged_by="Enregistré par : {name}",
)


def get_prompts(lang: str) -> PromptBundle:
    if lang == LANG_FR:
        return PROMPTS_FR
    return PROMPTS_EN
