"""WhatsApp accounting state machine router (PIN → master menu → multi-step flows)."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from parties import (
    CUSTOMER_PARTY_TYPES,
    EXPENSE_PARTY_TYPES,
    SUPPLIER_PARTY_TYPES,
    can_manage_parties,
)
from whatsapp_access import (
    STATE_AWAITING_PIN,
    STATE_MAIN_MENU,
    TYPE_ADD_PARTY,
    TYPE_BANK,
    TYPE_CASH_RECEIVED,
    TYPE_EXPENSE,
    TYPE_MERCHANDISE,
    TYPE_SUPPLIER,
    advance_step,
    ensure_session_row,
    get_company_name,
    is_cancel_command,
    is_greeting,
    looks_like_pin_attempt,
    reset_session,
    set_main_menu,
    set_session_after_pin,
    staff_pin_enabled,
    start_flow,
    update_flow_data,
    verify_staff_pin,
)
from whatsapp_i18n import detect_language_from_greeting, get_session_lang
from whatsapp_client import send_whatsapp_text
from whatsapp_parties import (
    ADD_NEW_CODE,
    BROWSE_ALL_CODE,
    PICKER_MODE_BROWSE,
    PICKER_MODE_SEARCH,
    create_party,
    format_party_no_matches,
    format_party_picker_message,
    format_party_search_prompt,
    format_party_search_results,
    get_party_page,
    parse_party_picker_input,
    search_parties,
)
from whatsapp_prompts import (
    AP_NAME,
    AP_SAVED,
    AP_TYPE,
    BK_AMOUNT,
    BK_PROOF_DEPOSIT,
    BK_PROOF_WITHDRAW,
    BK_TYPE,
    CR_AMOUNT,
    CR_JUSTIFICATION,
    CR_LOCATION,
    CR_PROOF,
    ERR_ADD_PARTY_DENIED,
    ERR_AMOUNT,
    ERR_CHOICE,
    ERR_PARTY_PICKER,
    ERR_PHOTO_OR_ZERO,
    ERR_PHOTO_REQUIRED,
    ERR_TEXT_REQUIRED,
    ERR_UNEXPECTED_PHOTO,
    EX_AMOUNT,
    EX_CATEGORY,
    EX_JUSTIFICATION,
    EX_PROOF,
    PICKER_CLIENT,
    PICKER_EXPENSE_PARTY,
    PICKER_SUPPLIER,
    PICKER_TR_CLIENT,
    SP_AMOUNT,
    SP_PROOF,
    SP_TYPE,
    TR_DOCUMENT,
    TR_PROOF,
    TR_SHORTAGE,
    TR_STATUS,
    TR_TRUCK,
    format_master_menu,
    format_saved,
    format_ask_pin,
    format_wrong_pin,
    set_prompt_lang,
    active_prompts,
)
from whatsapp_submissions import save_submission

logger = logging.getLogger("uvicorn.error")

# Step state keys
STEP_CR_AMOUNT = "cr.amount"
STEP_CR_CLIENT = "cr.client"
STEP_CR_LOCATION = "cr.location"
STEP_CR_PROOF = "cr.proof"
STEP_CR_JUSTIFICATION = "cr.justification"

STEP_EX_AMOUNT = "ex.amount"
STEP_EX_CATEGORY = "ex.category"
STEP_EX_PARTY = "ex.party"
STEP_EX_PROOF = "ex.proof"
STEP_EX_JUSTIFICATION = "ex.justification"

STEP_TR_TRUCK = "tr.truck"
STEP_TR_CLIENT = "tr.client"
STEP_TR_DOCUMENT = "tr.document"
STEP_TR_STATUS = "tr.status"
STEP_TR_SHORTAGE = "tr.shortage"
STEP_TR_PROOF = "tr.proof"

STEP_BK_TYPE = "bk.type"
STEP_BK_AMOUNT = "bk.amount"
STEP_BK_PROOF = "bk.proof"

STEP_SP_TYPE = "sp.type"
STEP_SP_SUPPLIER = "sp.supplier"
STEP_SP_AMOUNT = "sp.amount"
STEP_SP_PROOF = "sp.proof"

STEP_AP_TYPE = "ap.type"
STEP_AP_NAME = "ap.name"


@dataclass
class FlowResult:
    handled: bool = True
    status: dict[str, Any] = field(default_factory=dict)


def _parse_amount(text: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", (text or "").strip())
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _parse_choice(text: str, valid: dict[str, str]) -> Optional[str]:
    key = (text or "").strip()
    if key in valid:
        return key
    return None


def _employee_name(employee: dict) -> str:
    return employee.get("name") or "there"


def _is_admin(employee: dict) -> bool:
    return can_manage_parties(employee)


def _activate_lang(sender: str, text: str | None = None) -> None:
    if text and is_greeting(text):
        update_flow_data(sender, lang=detect_language_from_greeting(text))
    session = ensure_session_row(sender)
    set_prompt_lang(get_session_lang(session))


def _menu_choices() -> dict[str, tuple[str, str, str]]:
    p = active_prompts()
    return {
        "1": (TYPE_CASH_RECEIVED, STEP_CR_AMOUNT, p.cr_amount),
        "2": (TYPE_EXPENSE, STEP_EX_AMOUNT, p.ex_amount),
        "3": (TYPE_MERCHANDISE, STEP_TR_TRUCK, p.tr_truck),
        "4": (TYPE_BANK, STEP_BK_TYPE, p.bk_type),
        "5": (TYPE_SUPPLIER, STEP_SP_TYPE, p.sp_type),
    }


async def _start_party_picker(
    sender: str,
    employee: dict,
    *,
    title: str,
    party_types: tuple[str, ...],
) -> None:
    admin = _is_admin(employee)
    update_flow_data(
        sender,
        party_picker_mode=PICKER_MODE_SEARCH,
        party_picker_page=0,
        party_search_results=[],
        party_search_query="",
    )
    await _reply(
        sender,
        format_party_search_prompt(
            title=title, admin_can_add=admin, prompts=active_prompts()
        ),
    )


async def _send_party_browse(
    sender: str,
    employee: dict,
    *,
    title: str,
    party_types: tuple[str, ...],
    page: int = 0,
) -> None:
    admin = _is_admin(employee)
    parties, page, total_pages = get_party_page(party_types, page)
    update_flow_data(
        sender,
        party_picker_mode=PICKER_MODE_BROWSE,
        party_picker_page=page,
        party_search_results=[],
    )
    message = format_party_picker_message(
        title=title,
        parties=parties,
        page=page,
        total_pages=total_pages,
        admin_can_add=admin,
        prompts=active_prompts(),
    )
    await _reply(sender, message)


async def _send_party_search_results(
    sender: str,
    employee: dict,
    *,
    title: str,
    query: str,
    results: list,
) -> None:
    admin = _is_admin(employee)
    slim_results = [
        {"id": row["id"], "name": row["name"], "party_type": row.get("party_type")}
        for row in results
    ]
    update_flow_data(
        sender,
        party_picker_mode=PICKER_MODE_SEARCH,
        party_search_results=slim_results,
        party_search_query=query,
    )
    await _reply(
        sender,
        format_party_search_results(
            title=title,
            query=query,
            parties=slim_results,
            admin_can_add=admin,
            prompts=active_prompts(),
        ),
    )


async def _handle_party_picker(
    sender: str,
    employee: dict,
    *,
    party_types: tuple[str, ...],
    title: str,
    step: str,
    on_selected,
    **kwargs,
) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=title))
        return FlowResult(status={"status": "validation_error", "step": step})

    session = ensure_session_row(sender)
    flow_data = session.get("flow_data") or {}
    mode = flow_data.get("party_picker_mode") or PICKER_MODE_SEARCH
    page = int(flow_data.get("party_picker_page") or 0)
    search_results = flow_data.get("party_search_results") or []
    admin = _is_admin(employee)

    action, value = parse_party_picker_input(
        text,
        party_types=party_types,
        mode=mode,
        page=page,
        search_results=search_results,
        admin_can_add=admin,
    )

    if action == "search":
        query = str(value)
        results = search_parties(query, party_types)
        if not results:
            await _reply(
                sender,
                format_party_no_matches(
                    query=query, admin_can_add=admin, prompts=active_prompts()
                ),
            )
            update_flow_data(
                sender,
                party_picker_mode=PICKER_MODE_SEARCH,
                party_search_results=[],
                party_search_query=query,
            )
            return FlowResult(status={"status": "flow_step", "step": step})
        await _send_party_search_results(
            sender, employee, title=title, query=query, results=results
        )
        return FlowResult(status={"status": "flow_step", "step": step})

    if action == "browse":
        await _send_party_browse(
            sender, employee, title=title, party_types=party_types, page=int(value or 0)
        )
        return FlowResult(status={"status": "flow_step", "step": step})

    if action == "page":
        await _send_party_browse(
            sender, employee, title=title, party_types=party_types, page=value
        )
        return FlowResult(status={"status": "flow_step", "step": step})

    if action == "add_new":
        if not admin:
            await _reply(sender, ERR_ADD_PARTY_DENIED)
            if mode == PICKER_MODE_BROWSE:
                await _send_party_browse(
                    sender, employee, title=title, party_types=party_types, page=page
                )
            elif search_results:
                query = flow_data.get("party_search_query") or ""
                await _send_party_search_results(
                    sender,
                    employee,
                    title=title,
                    query=query,
                    results=search_results,
                )
            else:
                await _start_party_picker(
                    sender, employee, title=title, party_types=party_types
                )
            return FlowResult(status={"status": "validation_error", "step": step})
        update_flow_data(
            sender,
            add_return_step=step,
            add_return_flow=session.get("selected_action"),
            add_return_picker_title=title,
            add_return_party_types=list(party_types),
        )
        advance_step(sender, STEP_AP_TYPE)
        await _reply(sender, AP_TYPE)
        return FlowResult(status={"status": "flow_step", "step": STEP_AP_TYPE})

    if action == "select":
        return await on_selected(sender, employee, value, **kwargs)

    extra = f", {BROWSE_ALL_CODE} to browse all"
    if admin:
        extra += f", or {ADD_NEW_CODE} to add new"
    if mode == PICKER_MODE_BROWSE:
        extra += ", or 98/97 to change page"
    await _reply(sender, ERR_PARTY_PICKER.format(extra=extra))
    if mode == PICKER_MODE_BROWSE:
        await _send_party_browse(
            sender, employee, title=title, party_types=party_types, page=page
        )
    elif search_results:
        query = flow_data.get("party_search_query") or ""
        await _send_party_search_results(
            sender, employee, title=title, query=query, results=search_results
        )
    else:
        await _start_party_picker(
            sender, employee, title=title, party_types=party_types
        )
    return FlowResult(status={"status": "validation_error", "step": step})


async def _reply(phone: str, body: str) -> None:
    await send_whatsapp_text(phone, body)


async def _show_main_menu(phone: str, employee: dict) -> FlowResult:
    set_main_menu(phone)
    _activate_lang(phone)
    await _reply(
        phone,
        format_master_menu(_employee_name(employee), admin=_is_admin(employee)),
    )
    return FlowResult(status={"status": "main_menu", "sender": phone})


async def _restart_session_with_greeting(
    sender: str,
    employee: dict,
    text: str,
) -> FlowResult:
    """Full restart: clear session, set language from greeting, ask for PIN again."""
    lang = detect_language_from_greeting(text)
    reset_session(sender)
    update_flow_data(sender, lang=lang)
    set_prompt_lang(lang)
    name = _employee_name(employee)
    await _reply(sender, format_ask_pin(name, get_company_name()))
    return FlowResult(status={"status": "awaiting_pin", "sender": sender, "lang": lang})


async def handle_whatsapp_flow(
    sender: str,
    employee: dict,
    *,
    message_type: str,
    message: dict,
    text_body: Optional[str],
    is_media: bool,
    media_id: Optional[str],
    mime_type: Optional[str],
    whatsapp_message_id: Optional[str],
) -> FlowResult:
    if not staff_pin_enabled():
        return FlowResult(handled=False, status={"status": "pin_disabled"})

    try:
        session = ensure_session_row(sender)
        _activate_lang(sender)
        state = session.get("state") or STATE_AWAITING_PIN
        name = _employee_name(employee)

        if state == STATE_AWAITING_PIN:
            return await _handle_pin(
                sender, employee, text_body=text_body, is_media=is_media
            )

        text = (text_body or "").strip()
        if text and is_greeting(text):
            return await _restart_session_with_greeting(sender, employee, text)

        if is_cancel_command(text_body or "") and state == STATE_MAIN_MENU:
            return await _show_main_menu(sender, employee)

        if is_cancel_command(text_body or ""):
            return await _show_main_menu(sender, employee)

        if state == STATE_MAIN_MENU:
            return await _handle_main_menu(
                sender, employee, text_body=text_body, is_media=is_media
            )

        return await _handle_flow_step(
            sender,
            employee,
            session=session,
            message_type=message_type,
            text_body=text_body,
            is_media=is_media,
            media_id=media_id,
            whatsapp_message_id=whatsapp_message_id,
        )
    except Exception:
        logger.exception("WhatsApp flow failed for sender %s", sender)
        try:
            _activate_lang(sender)
            await _reply(sender, format_ask_pin(_employee_name(employee), get_company_name()))
        except Exception:
            logger.exception("Failed to send flow recovery message to %s", sender)
        return FlowResult(status={"status": "flow_error", "sender": sender})


async def _handle_pin(
    sender: str,
    employee: dict,
    *,
    text_body: Optional[str],
    is_media: bool,
) -> FlowResult:
    name = _employee_name(employee)
    _activate_lang(sender)
    if is_media:
        await _reply(sender, format_ask_pin(name, get_company_name()))
        return FlowResult(status={"status": "awaiting_pin", "sender": sender})

    text = (text_body or "").strip()
    if is_greeting(text) or not text:
        _activate_lang(sender, text)
        await _reply(sender, format_ask_pin(name, get_company_name()))
        return FlowResult(status={"status": "awaiting_pin", "sender": sender})

    if looks_like_pin_attempt(text):
        if verify_staff_pin(text):
            set_session_after_pin(sender)
            _activate_lang(sender)
            return await _show_main_menu(sender, employee)
        await _reply(sender, format_wrong_pin())
        return FlowResult(status={"status": "wrong_pin", "sender": sender})

    await _reply(sender, format_ask_pin(name, get_company_name()))
    return FlowResult(status={"status": "awaiting_pin", "sender": sender})


async def _handle_main_menu(
    sender: str,
    employee: dict,
    *,
    text_body: Optional[str],
    is_media: bool,
) -> FlowResult:
    _activate_lang(sender)
    if is_media:
        await _reply(
            sender,
            ERR_UNEXPECTED_PHOTO.format(
                prompt=format_master_menu(_employee_name(employee), admin=_is_admin(employee))
            ),
        )
        return FlowResult(status={"status": "main_menu", "sender": sender})

    choice = (text_body or "").strip()
    admin = _is_admin(employee)

    if choice == "6":
        if not admin:
            p = active_prompts()
            await _reply(
                sender,
                ERR_CHOICE.format(hint=p.menu_hint)
                + "\n\n"
                + format_master_menu(_employee_name(employee), admin=False),
            )
            return FlowResult(status={"status": "invalid_menu_choice", "sender": sender})
        start_flow(sender, TYPE_ADD_PARTY, STEP_AP_TYPE)
        await _reply(sender, AP_TYPE)
        return FlowResult(status={"status": "flow_started", "flow": TYPE_ADD_PARTY, "sender": sender})

    menu = _menu_choices()
    if choice not in menu:
        p = active_prompts()
        hint = p.menu_hint_admin if admin else p.menu_hint
        await _reply(
            sender,
            ERR_CHOICE.format(hint=hint)
            + "\n\n"
            + format_master_menu(_employee_name(employee), admin=admin),
        )
        return FlowResult(status={"status": "invalid_menu_choice", "sender": sender})

    flow_type, first_step, prompt = menu[choice]
    start_flow(sender, flow_type, first_step)
    await _reply(sender, prompt)
    return FlowResult(status={"status": "flow_started", "flow": flow_type, "sender": sender})


async def _handle_flow_step(
    sender: str,
    employee: dict,
    *,
    session: dict,
    message_type: str,
    text_body: Optional[str],
    is_media: bool,
    media_id: Optional[str],
    whatsapp_message_id: Optional[str],
) -> FlowResult:
    state = session.get("state") or STATE_MAIN_MENU
    flow_type = session.get("selected_action")
    flow_data = session.get("flow_data") or {}
    text = (text_body or "").strip()
    _activate_lang(sender)

    handlers = {
        STEP_CR_AMOUNT: _step_cr_amount,
        STEP_CR_CLIENT: _step_cr_client,
        STEP_CR_LOCATION: _step_cr_location,
        STEP_CR_PROOF: _step_cr_proof,
        STEP_CR_JUSTIFICATION: _step_cr_justification,
        STEP_EX_AMOUNT: _step_ex_amount,
        STEP_EX_CATEGORY: _step_ex_category,
        STEP_EX_PARTY: _step_ex_party,
        STEP_EX_PROOF: _step_ex_proof,
        STEP_EX_JUSTIFICATION: _step_ex_justification,
        STEP_TR_TRUCK: _step_tr_truck,
        STEP_TR_CLIENT: _step_tr_client,
        STEP_TR_DOCUMENT: _step_tr_document,
        STEP_TR_STATUS: _step_tr_status,
        STEP_TR_SHORTAGE: _step_tr_shortage,
        STEP_TR_PROOF: _step_tr_proof,
        STEP_BK_TYPE: _step_bk_type,
        STEP_BK_AMOUNT: _step_bk_amount,
        STEP_BK_PROOF: _step_bk_proof,
        STEP_SP_TYPE: _step_sp_type,
        STEP_SP_SUPPLIER: _step_sp_supplier,
        STEP_SP_AMOUNT: _step_sp_amount,
        STEP_SP_PROOF: _step_sp_proof,
        STEP_AP_TYPE: _step_ap_type,
        STEP_AP_NAME: _step_ap_name,
    }

    handler = handlers.get(state)
    if not handler:
        return await _show_main_menu(sender, employee)

    return await handler(
        sender,
        employee,
        flow_type=flow_type,
        flow_data=flow_data,
        text=text,
        is_media=is_media,
        media_id=media_id,
        whatsapp_message_id=whatsapp_message_id,
    )


async def _finish_submission(
    sender: str,
    employee: dict,
    *,
    submission_type: str,
    amount: Optional[int],
    payload: dict[str, Any],
    summary: str,
    whatsapp_message_id: Optional[str],
    proof_media_id: Optional[str],
) -> FlowResult:
    _, receipt_id = save_submission(
        employee_id=employee["id"],
        sender=sender,
        submission_type=submission_type,
        amount=amount,
        payload=payload,
        whatsapp_message_id=whatsapp_message_id,
        proof_media_id=proof_media_id,
    )
    set_main_menu(sender)
    await _reply(sender, format_saved(receipt_id, summary, _employee_name(employee)))
    return FlowResult(
        status={
            "status": "saved",
            "submission_type": submission_type,
            "receipt_id": receipt_id,
            "sender": sender,
        }
    )


# --- Choice 1: Cash Received ---

async def _step_cr_amount(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=CR_AMOUNT))
        return FlowResult(status={"status": "validation_error", "step": STEP_CR_AMOUNT})
    amount = _parse_amount(text)
    if amount is None:
        await _reply(sender, ERR_AMOUNT)
        return FlowResult(status={"status": "validation_error", "step": STEP_CR_AMOUNT})
    update_flow_data(sender, amount=amount)
    advance_step(sender, STEP_CR_CLIENT)
    await _start_party_picker(
        sender, employee, title=PICKER_CLIENT, party_types=CUSTOMER_PARTY_TYPES
    )
    return FlowResult(status={"status": "flow_step", "step": STEP_CR_CLIENT})


async def _step_cr_client(sender, employee, **kwargs) -> FlowResult:
    async def on_selected(s, e, party, **_kw):
        update_flow_data(s, client=party["name"], client_id=party["id"])
        advance_step(s, STEP_CR_LOCATION)
        await _reply(s, CR_LOCATION)
        return FlowResult(status={"status": "flow_step", "step": STEP_CR_LOCATION})

    return await _handle_party_picker(
        sender,
        employee,
        party_types=CUSTOMER_PARTY_TYPES,
        title=PICKER_CLIENT,
        step=STEP_CR_CLIENT,
        on_selected=on_selected,
        **kwargs,
    )


async def _step_cr_location(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=CR_LOCATION))
        return FlowResult(status={"status": "validation_error", "step": STEP_CR_LOCATION})
    choice = _parse_choice(text, active_prompts().location_labels)
    if not choice:
        await _reply(sender, ERR_CHOICE.format(hint="Reply 1, 2, or 3.") + "\n\n" + CR_LOCATION)
        return FlowResult(status={"status": "validation_error", "step": STEP_CR_LOCATION})
    labels = active_prompts().location_labels
    update_flow_data(sender, location=labels[choice], location_code=choice)
    advance_step(sender, STEP_CR_PROOF)
    await _reply(sender, CR_PROOF)
    return FlowResult(status={"status": "flow_step", "step": STEP_CR_PROOF})


async def _step_cr_proof(sender, employee, **kwargs) -> FlowResult:
    text, is_media, media_id = kwargs["text"], kwargs["is_media"], kwargs["media_id"]
    if is_media and media_id:
        update_flow_data(sender, proof_media_id=media_id, proof_skipped=False)
        return await _save_cash_received(sender, employee, kwargs)
    if text == "0":
        advance_step(sender, STEP_CR_JUSTIFICATION)
        await _reply(sender, CR_JUSTIFICATION)
        return FlowResult(status={"status": "flow_step", "step": STEP_CR_JUSTIFICATION})
    await _reply(sender, ERR_PHOTO_OR_ZERO)
    return FlowResult(status={"status": "validation_error", "step": STEP_CR_PROOF})


async def _step_cr_justification(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media or not text:
        await _reply(sender, ERR_TEXT_REQUIRED if not is_media else ERR_UNEXPECTED_PHOTO.format(prompt=CR_JUSTIFICATION))
        return FlowResult(status={"status": "validation_error", "step": STEP_CR_JUSTIFICATION})
    update_flow_data(sender, missing_paperwork_reason=text, proof_skipped=True)
    return await _save_cash_received(sender, employee, kwargs)


async def _save_cash_received(sender, employee, kwargs) -> FlowResult:
    session = ensure_session_row(sender)
    _activate_lang(sender)
    data = session.get("flow_data") or {}
    summary = active_prompts().summary_cash_received(data)
    return await _finish_submission(
        sender,
        employee,
        submission_type=TYPE_CASH_RECEIVED,
        amount=data.get("amount"),
        payload=data,
        summary=summary,
        whatsapp_message_id=kwargs.get("whatsapp_message_id"),
        proof_media_id=data.get("proof_media_id"),
    )


# --- Choice 2: Expense ---

async def _step_ex_amount(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=EX_AMOUNT))
        return FlowResult(status={"status": "validation_error", "step": STEP_EX_AMOUNT})
    amount = _parse_amount(text)
    if amount is None:
        await _reply(sender, ERR_AMOUNT)
        return FlowResult(status={"status": "validation_error", "step": STEP_EX_AMOUNT})
    update_flow_data(sender, amount=amount)
    advance_step(sender, STEP_EX_CATEGORY)
    await _reply(sender, EX_CATEGORY)
    return FlowResult(status={"status": "flow_step", "step": STEP_EX_CATEGORY})


async def _step_ex_category(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=EX_CATEGORY))
        return FlowResult(status={"status": "validation_error", "step": STEP_EX_CATEGORY})
    choice = _parse_choice(text, active_prompts().expense_categories)
    if not choice:
        await _reply(sender, ERR_CHOICE.format(hint="Reply 1–6.") + "\n\n" + EX_CATEGORY)
        return FlowResult(status={"status": "validation_error", "step": STEP_EX_CATEGORY})
    categories = active_prompts().expense_categories
    update_flow_data(sender, category=categories[choice], category_code=choice)
    advance_step(sender, STEP_EX_PARTY)
    await _start_party_picker(
        sender, employee, title=PICKER_EXPENSE_PARTY, party_types=EXPENSE_PARTY_TYPES
    )
    return FlowResult(status={"status": "flow_step", "step": STEP_EX_PARTY})


async def _step_ex_party(sender, employee, **kwargs) -> FlowResult:
    async def on_selected(s, e, party, **_kw):
        update_flow_data(s, expense_party=party["name"], expense_party_id=party["id"])
        advance_step(s, STEP_EX_PROOF)
        await _reply(s, EX_PROOF)
        return FlowResult(status={"status": "flow_step", "step": STEP_EX_PROOF})

    return await _handle_party_picker(
        sender,
        employee,
        party_types=EXPENSE_PARTY_TYPES,
        title=PICKER_EXPENSE_PARTY,
        step=STEP_EX_PARTY,
        on_selected=on_selected,
        **kwargs,
    )


async def _step_ex_proof(sender, employee, **kwargs) -> FlowResult:
    text, is_media, media_id = kwargs["text"], kwargs["is_media"], kwargs["media_id"]
    if is_media and media_id:
        update_flow_data(sender, proof_media_id=media_id, proof_skipped=False)
        return await _save_expense(sender, employee, kwargs)
    if text == "0":
        advance_step(sender, STEP_EX_JUSTIFICATION)
        await _reply(sender, EX_JUSTIFICATION)
        return FlowResult(status={"status": "flow_step", "step": STEP_EX_JUSTIFICATION})
    await _reply(sender, ERR_PHOTO_OR_ZERO)
    return FlowResult(status={"status": "validation_error", "step": STEP_EX_PROOF})


async def _step_ex_justification(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media or not text:
        await _reply(sender, ERR_TEXT_REQUIRED if not is_media else ERR_UNEXPECTED_PHOTO.format(prompt=EX_JUSTIFICATION))
        return FlowResult(status={"status": "validation_error", "step": STEP_EX_JUSTIFICATION})
    update_flow_data(sender, missing_paperwork_reason=text, proof_skipped=True)
    return await _save_expense(sender, employee, kwargs)


async def _save_expense(sender, employee, kwargs) -> FlowResult:
    session = ensure_session_row(sender)
    _activate_lang(sender)
    data = session.get("flow_data") or {}
    summary = active_prompts().summary_expense(data)
    return await _finish_submission(
        sender,
        employee,
        submission_type=TYPE_EXPENSE,
        amount=data.get("amount"),
        payload=data,
        summary=summary,
        whatsapp_message_id=kwargs.get("whatsapp_message_id"),
        proof_media_id=data.get("proof_media_id"),
    )


# --- Choice 3: Truck / Delivery ---

async def _step_tr_truck(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media or not text:
        await _reply(sender, ERR_TEXT_REQUIRED if not is_media else ERR_UNEXPECTED_PHOTO.format(prompt=TR_TRUCK))
        return FlowResult(status={"status": "validation_error", "step": STEP_TR_TRUCK})
    update_flow_data(sender, truck_id=text)
    advance_step(sender, STEP_TR_CLIENT)
    await _start_party_picker(
        sender, employee, title=PICKER_TR_CLIENT, party_types=CUSTOMER_PARTY_TYPES
    )
    return FlowResult(status={"status": "flow_step", "step": STEP_TR_CLIENT})


async def _step_tr_client(sender, employee, **kwargs) -> FlowResult:
    async def on_selected(s, e, party, **_kw):
        update_flow_data(s, client=party["name"], client_id=party["id"])
        advance_step(s, STEP_TR_DOCUMENT)
        await _reply(s, TR_DOCUMENT)
        return FlowResult(status={"status": "flow_step", "step": STEP_TR_DOCUMENT})

    return await _handle_party_picker(
        sender,
        employee,
        party_types=CUSTOMER_PARTY_TYPES,
        title=PICKER_TR_CLIENT,
        step=STEP_TR_CLIENT,
        on_selected=on_selected,
        **kwargs,
    )


async def _step_tr_document(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media or not text:
        await _reply(sender, ERR_TEXT_REQUIRED if not is_media else ERR_UNEXPECTED_PHOTO.format(prompt=TR_DOCUMENT))
        return FlowResult(status={"status": "validation_error", "step": STEP_TR_DOCUMENT})
    update_flow_data(sender, document_id=text)
    advance_step(sender, STEP_TR_STATUS)
    await _reply(sender, TR_STATUS)
    return FlowResult(status={"status": "flow_step", "step": STEP_TR_STATUS})


async def _step_tr_status(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=TR_STATUS))
        return FlowResult(status={"status": "validation_error", "step": STEP_TR_STATUS})
    if text == "1":
        labels = active_prompts().loading_status_labels
        update_flow_data(sender, loading_status=labels["1"], loading_status_code="1", partial=False)
        advance_step(sender, STEP_TR_PROOF)
        await _reply(sender, TR_PROOF)
        return FlowResult(status={"status": "flow_step", "step": STEP_TR_PROOF})
    if text == "2":
        labels = active_prompts().loading_status_labels
        update_flow_data(sender, loading_status=labels["2"], loading_status_code="2", partial=True)
        advance_step(sender, STEP_TR_SHORTAGE)
        await _reply(sender, TR_SHORTAGE)
        return FlowResult(status={"status": "flow_step", "step": STEP_TR_SHORTAGE})
    await _reply(sender, ERR_CHOICE.format(hint="Reply 1 or 2.") + "\n\n" + TR_STATUS)
    return FlowResult(status={"status": "validation_error", "step": STEP_TR_STATUS})


async def _step_tr_shortage(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media or not text:
        await _reply(sender, ERR_TEXT_REQUIRED if not is_media else ERR_UNEXPECTED_PHOTO.format(prompt=TR_SHORTAGE))
        return FlowResult(status={"status": "validation_error", "step": STEP_TR_SHORTAGE})
    update_flow_data(sender, shortage_details=text)
    advance_step(sender, STEP_TR_PROOF)
    await _reply(sender, TR_PROOF)
    return FlowResult(status={"status": "flow_step", "step": STEP_TR_PROOF})


async def _step_tr_proof(sender, employee, **kwargs) -> FlowResult:
    is_media, media_id = kwargs["is_media"], kwargs["media_id"]
    if not is_media or not media_id:
        await _reply(sender, ERR_PHOTO_REQUIRED + "\n\n" + TR_PROOF)
        return FlowResult(status={"status": "validation_error", "step": STEP_TR_PROOF})
    update_flow_data(sender, proof_media_id=media_id)
    session = ensure_session_row(sender)
    _activate_lang(sender)
    data = session.get("flow_data") or {}
    summary = active_prompts().summary_truck(data)
    return await _finish_submission(
        sender,
        employee,
        submission_type=TYPE_MERCHANDISE,
        amount=None,
        payload=data,
        summary=summary,
        whatsapp_message_id=kwargs.get("whatsapp_message_id"),
        proof_media_id=media_id,
    )


# --- Choice 4: Bank ---

async def _step_bk_type(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=BK_TYPE))
        return FlowResult(status={"status": "validation_error", "step": STEP_BK_TYPE})
    choice = _parse_choice(text, active_prompts().bank_types)
    if not choice:
        await _reply(sender, ERR_CHOICE.format(hint="Reply 1 or 2.") + "\n\n" + BK_TYPE)
        return FlowResult(status={"status": "validation_error", "step": STEP_BK_TYPE})
    bank_types = active_prompts().bank_types
    update_flow_data(sender, bank_action=bank_types[choice], bank_action_code=choice)
    advance_step(sender, STEP_BK_AMOUNT)
    await _reply(sender, BK_AMOUNT)
    return FlowResult(status={"status": "flow_step", "step": STEP_BK_AMOUNT})


async def _step_bk_amount(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=BK_AMOUNT))
        return FlowResult(status={"status": "validation_error", "step": STEP_BK_AMOUNT})
    amount = _parse_amount(text)
    if amount is None:
        await _reply(sender, ERR_AMOUNT)
        return FlowResult(status={"status": "validation_error", "step": STEP_BK_AMOUNT})
    update_flow_data(sender, amount=amount)
    advance_step(sender, STEP_BK_PROOF)
    session = ensure_session_row(sender)
    proof_prompt = (
        BK_PROOF_DEPOSIT
        if (session.get("flow_data") or {}).get("bank_action_code") == "1"
        else BK_PROOF_WITHDRAW
    )
    update_flow_data(sender, proof_prompt=proof_prompt)
    await _reply(sender, proof_prompt)
    return FlowResult(status={"status": "flow_step", "step": STEP_BK_PROOF})


async def _step_bk_proof(sender, employee, **kwargs) -> FlowResult:
    is_media, media_id = kwargs["is_media"], kwargs["media_id"]
    session = ensure_session_row(sender)
    data = session.get("flow_data") or {}
    if not is_media or not media_id:
        prompt = data.get("proof_prompt") or BK_PROOF_DEPOSIT
        await _reply(sender, ERR_PHOTO_REQUIRED + "\n\n" + prompt)
        return FlowResult(status={"status": "validation_error", "step": STEP_BK_PROOF})
    update_flow_data(sender, proof_media_id=media_id)
    session = ensure_session_row(sender)
    _activate_lang(sender)
    data = session.get("flow_data") or {}
    summary = active_prompts().summary_bank(data)
    return await _finish_submission(
        sender,
        employee,
        submission_type=TYPE_BANK,
        amount=data.get("amount"),
        payload=data,
        summary=summary,
        whatsapp_message_id=kwargs.get("whatsapp_message_id"),
        proof_media_id=media_id,
    )


# --- Choice 5: Supplier ---

async def _step_sp_type(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=SP_TYPE))
        return FlowResult(status={"status": "validation_error", "step": STEP_SP_TYPE})
    choice = _parse_choice(text, active_prompts().supplier_types)
    if not choice:
        await _reply(sender, ERR_CHOICE.format(hint="Reply 1, 2, or 3.") + "\n\n" + SP_TYPE)
        return FlowResult(status={"status": "validation_error", "step": STEP_SP_TYPE})
    supplier_types = active_prompts().supplier_types
    update_flow_data(sender, payment_type=supplier_types[choice], payment_type_code=choice)
    advance_step(sender, STEP_SP_SUPPLIER)
    await _start_party_picker(
        sender, employee, title=PICKER_SUPPLIER, party_types=SUPPLIER_PARTY_TYPES
    )
    return FlowResult(status={"status": "flow_step", "step": STEP_SP_SUPPLIER})


async def _step_sp_supplier(sender, employee, **kwargs) -> FlowResult:
    async def on_selected(s, e, party, **_kw):
        update_flow_data(s, supplier=party["name"], supplier_id=party["id"])
        advance_step(s, STEP_SP_AMOUNT)
        await _reply(s, SP_AMOUNT)
        return FlowResult(status={"status": "flow_step", "step": STEP_SP_AMOUNT})

    return await _handle_party_picker(
        sender,
        employee,
        party_types=SUPPLIER_PARTY_TYPES,
        title=PICKER_SUPPLIER,
        step=STEP_SP_SUPPLIER,
        on_selected=on_selected,
        **kwargs,
    )


async def _step_sp_amount(sender, employee, **kwargs) -> FlowResult:
    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=SP_AMOUNT))
        return FlowResult(status={"status": "validation_error", "step": STEP_SP_AMOUNT})
    amount = _parse_amount(text)
    if amount is None:
        await _reply(sender, ERR_AMOUNT)
        return FlowResult(status={"status": "validation_error", "step": STEP_SP_AMOUNT})
    update_flow_data(sender, amount=amount)
    advance_step(sender, STEP_SP_PROOF)
    await _reply(sender, SP_PROOF)
    return FlowResult(status={"status": "flow_step", "step": STEP_SP_PROOF})


async def _step_sp_proof(sender, employee, **kwargs) -> FlowResult:
    is_media, media_id = kwargs["is_media"], kwargs["media_id"]
    if not is_media or not media_id:
        await _reply(sender, ERR_PHOTO_REQUIRED + "\n\n" + SP_PROOF)
        return FlowResult(status={"status": "validation_error", "step": STEP_SP_PROOF})
    update_flow_data(sender, proof_media_id=media_id)
    session = ensure_session_row(sender)
    _activate_lang(sender)
    data = session.get("flow_data") or {}
    summary = active_prompts().summary_supplier(data)
    return await _finish_submission(
        sender,
        employee,
        submission_type=TYPE_SUPPLIER,
        amount=data.get("amount"),
        payload=data,
        summary=summary,
        whatsapp_message_id=kwargs.get("whatsapp_message_id"),
        proof_media_id=media_id,
    )


# --- Admin: Add client / supplier ---


async def _return_after_add_party(sender: str, employee: dict) -> FlowResult:
    session = ensure_session_row(sender)
    data = session.get("flow_data") or {}
    return_step = data.get("add_return_step")
    return_flow = data.get("add_return_flow")
    picker_title = data.get("add_return_picker_title")
    party_types_raw = data.get("add_return_party_types")

    if return_step and return_flow and picker_title and party_types_raw:
        party_types = tuple(party_types_raw)
        start_flow(sender, return_flow, return_step)
        update_flow_data(
            sender,
            add_return_step=None,
            add_return_flow=None,
            add_return_picker_title=None,
            add_return_party_types=None,
            party_picker_page=0,
        )
        await _start_party_picker(
            sender, employee, title=picker_title, party_types=party_types
        )
        return FlowResult(status={"status": "flow_step", "step": return_step})

    return await _show_main_menu(sender, employee)


async def _step_ap_type(sender, employee, **kwargs) -> FlowResult:
    if not _is_admin(employee):
        return await _show_main_menu(sender, employee)

    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media:
        await _reply(sender, ERR_UNEXPECTED_PHOTO.format(prompt=AP_TYPE))
        return FlowResult(status={"status": "validation_error", "step": STEP_AP_TYPE})
    add_party_types = active_prompts().add_party_type_labels
    choice = _parse_choice(text, {k: v[1] for k, v in add_party_types.items()})
    if not choice:
        await _reply(sender, ERR_CHOICE.format(hint="Reply 1, 2, or 3.") + "\n\n" + AP_TYPE)
        return FlowResult(status={"status": "validation_error", "step": STEP_AP_TYPE})
    party_type, type_label = add_party_types[choice]
    update_flow_data(sender, new_party_type=party_type, new_party_type_label=type_label)
    advance_step(sender, STEP_AP_NAME)
    await _reply(sender, AP_NAME)
    return FlowResult(status={"status": "flow_step", "step": STEP_AP_NAME})


async def _step_ap_name(sender, employee, **kwargs) -> FlowResult:
    if not _is_admin(employee):
        return await _show_main_menu(sender, employee)

    text, is_media = kwargs["text"], kwargs["is_media"]
    if is_media or not text:
        await _reply(
            sender,
            ERR_TEXT_REQUIRED if not is_media else ERR_UNEXPECTED_PHOTO.format(prompt=AP_NAME),
        )
        return FlowResult(status={"status": "validation_error", "step": STEP_AP_NAME})

    session = ensure_session_row(sender)
    data = session.get("flow_data") or {}
    party_type = data.get("new_party_type") or "both"
    type_label = data.get("new_party_type_label") or party_type.title()

    party = create_party(text, party_type)
    if not party:
        await _reply(sender, ERR_TEXT_REQUIRED + "\n\n" + AP_NAME)
        return FlowResult(status={"status": "validation_error", "step": STEP_AP_NAME})

    await _reply(sender, AP_SAVED.format(name=party["name"], type_label=type_label))
    return await _return_after_add_party(sender, employee)
