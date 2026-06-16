"""User-facing WhatsApp copy — resolves English/French from session language."""

from __future__ import annotations

from contextvars import ContextVar

from whatsapp_i18n import get_prompts

_current_lang: ContextVar[str] = ContextVar("whatsapp_lang", default="en")

_ATTR_ALIASES = {
    "CR_AMOUNT": "cr_amount",
    "CR_LOCATION": "cr_location",
    "CR_PROOF": "cr_proof",
    "CR_JUSTIFICATION": "cr_justification",
    "EX_AMOUNT": "ex_amount",
    "EX_CATEGORY": "ex_category",
    "EX_PROOF": "ex_proof",
    "EX_JUSTIFICATION": "ex_justification",
    "TR_TRUCK": "tr_truck",
    "TR_DOCUMENT": "tr_document",
    "TR_STATUS": "tr_status",
    "TR_SHORTAGE": "tr_shortage",
    "TR_PROOF": "tr_proof",
    "BK_TYPE": "bk_type",
    "BK_AMOUNT": "bk_amount",
    "BK_PROOF_DEPOSIT": "bk_proof_deposit",
    "BK_PROOF_WITHDRAW": "bk_proof_withdraw",
    "SP_TYPE": "sp_type",
    "SP_AMOUNT": "sp_amount",
    "SP_PROOF": "sp_proof",
    "AP_TYPE": "ap_type",
    "AP_NAME": "ap_name",
    "AP_SAVED": "ap_saved",
    "PICKER_CLIENT": "picker_client",
    "PICKER_EXPENSE_PARTY": "picker_expense_party",
    "PICKER_TR_CLIENT": "picker_tr_client",
    "PICKER_SUPPLIER": "picker_supplier",
    "ERR_AMOUNT": "err_amount",
    "ERR_CHOICE": "err_choice",
    "ERR_TEXT_REQUIRED": "err_text_required",
    "ERR_PHOTO_REQUIRED": "err_photo_required",
    "ERR_PHOTO_OR_ZERO": "err_photo_or_zero",
    "ERR_UNEXPECTED_PHOTO": "err_unexpected_photo",
    "ERR_PARTY_PICKER": "err_party_picker",
    "ERR_ADD_PARTY_DENIED": "err_add_party_denied",
}

_DICT_ALIASES = {
    "LOCATION_LABELS": "location_labels",
    "EXPENSE_CATEGORIES": "expense_categories",
    "BANK_TYPES": "bank_types",
    "SUPPLIER_TYPES": "supplier_types",
    "ADD_PARTY_TYPE_LABELS": "add_party_type_labels",
    "LOADING_STATUS_LABELS": "loading_status_labels",
}


def set_prompt_lang(lang: str) -> None:
    _current_lang.set("fr" if lang == "fr" else "en")


def active_prompts():
    return get_prompts(_current_lang.get())


def format_master_menu(name: str, *, admin: bool = False) -> str:
    return active_prompts().format_master_menu(name, admin=admin)


def format_saved(receipt_id: str, summary: str, employee_name: str) -> str:
    return active_prompts().format_saved(receipt_id, summary, employee_name)


def format_ask_pin(employee_name: str, company_name: str) -> str:
    return active_prompts().format_ask_pin(employee_name, company_name)


def format_wrong_pin() -> str:
    return active_prompts().wrong_pin


def __getattr__(name: str):
    alias = _ATTR_ALIASES.get(name) or _DICT_ALIASES.get(name)
    if alias:
        return getattr(active_prompts(), alias)
    raise AttributeError(name)
