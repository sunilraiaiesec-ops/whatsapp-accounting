import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("uvicorn.error")

from delivery_extractor import DEFAULT_FIELD_LABELS, DELIVERY_FIELDS

WHATSAPP_ACCESS_TOKEN = (os.environ.get("WHATSAPP_ACCESS_TOKEN") or "").strip() or None
WHATSAPP_PHONE_NUMBER_ID = (os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or "").strip() or None
WHATSAPP_API_VERSION = (os.environ.get("WHATSAPP_API_VERSION") or "v21.0").strip()


def format_amount(amount: Optional[int], currency: Optional[str]) -> str:
    if amount is None:
        return "unknown amount"
    parts = [f"{amount:,}"]
    if currency:
        parts.append(currency)
    return " ".join(parts)


def format_confirmation(
    parsed: dict,
    employee_name: Optional[str],
    status: str,
    party_balance: Optional[str] = None,
) -> str:
    type_labels = {
        "expense": "Expense",
        "receipt": "Receipt",
        "payment": "Payment",
        "return_payment": "Return",
        "unknown": "Entry",
    }
    label = type_labels.get(parsed["type"], "Entry")
    amount_text = format_amount(parsed["amount"], parsed["currency"])
    party = parsed.get("party") or "unknown party"
    category = parsed.get("category")
    category_text = f" ({category})" if category else ""

    logged_by = f"\nLogged by: {employee_name}" if employee_name else ""

    if status == "pending_review":
        return (
            "⚠️ Saved for review — I couldn't fully understand this message.\n"
            f'Your message: "{parsed["original_message"]}"\n\n'
            "Please resend using this format:\n"
            "Paid Ahmed 50000 FCFA transport\n"
            "Received from Jean 120000 FCFA"
            f"{logged_by}"
        )

    return (
        f"✅ Saved: {label} {amount_text} → {party}{category_text}"
        + (f"\n{party_balance}" if party_balance else "")
        + logged_by
    )


def format_unauthorized_reply() -> str:
    return (
        "⛔ This phone number is not registered.\n"
        "Only approved team members can use this WhatsApp accounting line.\n"
        "Contact the business owner to be added."
    )


def format_ask_pin_reply(employee_name: str) -> str:
    return (
        f"Hi {employee_name} 👋\n\n"
        "Enter your *team PIN* to continue.\n"
        "Only the owner shares this PIN with staff."
    )


def format_wrong_pin_reply() -> str:
    return (
        "⛔ Wrong PIN.\n"
        "Ask the owner for the correct team PIN and try again."
    )


def format_pin_expired_reply(employee_name: str) -> str:
    return (
        f"Hi {employee_name}, your session expired.\n"
        "Enter your team PIN again to continue."
    )


def format_action_menu_prompt(employee_name: str) -> str:
    return (
        f"Thanks {employee_name}. What do you want to do?\n\n"
        "Tap a button below, or reply:\n"
        "1 — Cash update (paid/received)\n"
        "2 — Delivery note photo\n"
        "0 — Cancel / choose again"
    )


def format_action_selected_reply(action: str) -> str:
    if action == "cash":
        return (
            "✅ *Cash update* selected.\n\n"
            "Send your message, for example:\n"
            "Paid Ahmed 50000 FCFA transport\n"
            "Received from Jean 120000 FCFA\n\n"
            "Reply MENU to choose something else."
        )
    return (
        "✅ *Delivery note* selected.\n\n"
        "Send a clear photo of the delivery form (camera icon).\n\n"
        "Reply MENU to choose something else."
    )


def format_need_pin_first_reply() -> str:
    return "Enter your team PIN first before choosing an action."


def format_need_delivery_photo_reply() -> str:
    return (
        "You chose *Delivery note*.\n"
        "Send a photo of the delivery form (camera icon, not as a file)."
    )


def format_delivery_unauthorized_reply() -> str:
    return (
        "⛔ Only owners and warehouse managers can submit delivery note photos.\n"
        "Ask your admin to set your role to Warehouse manager.\n"
        "Text money updates work for all registered staff:\n"
        "Paid Ahmed 50000 FCFA transport"
    )


def format_delivery_received_ack() -> str:
    return "📷 Received — reading your delivery note…"


def format_unsupported_message_reply(message_type: str) -> str:
    return (
        f"⚠️ Message type '{message_type}' is not supported.\n"
        "For delivery notes, send a photo of the form (camera icon, not as a file).\n"
        "For cash updates, send text like:\n"
        "Paid Ahmed 50000 FCFA transport"
    )


async def download_whatsapp_media(media_id: str) -> tuple[bytes, str]:
    if not WHATSAPP_ACCESS_TOKEN:
        raise RuntimeError("WHATSAPP_ACCESS_TOKEN not configured")

    headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
    meta_url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{media_id}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        meta_response = await client.get(meta_url, headers=headers)
        meta_response.raise_for_status()
        media_url = meta_response.json()["url"]

        media_response = await client.get(media_url, headers=headers)
        media_response.raise_for_status()
        mime_type = media_response.headers.get("content-type", "image/jpeg")
        return media_response.content, mime_type.split(";")[0]


def _format_delivery_field_value(fields: dict, key: str) -> Optional[str]:
    value = fields.get(key)
    if key == "quantity":
        qty = fields.get("quantity")
        if qty is None:
            return None
        unit = fields.get("quantity_unit") or ""
        return f"{qty:,} {unit}".strip()
    if key == "quantity_unit":
        return None
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return str(value)


def _delivery_receipt_lines(fields: dict, audit: Optional[dict] = None) -> list[str]:
    labels = (audit or {}).get("field_labels") or DEFAULT_FIELD_LABELS
    lines: list[str] = []
    for key in DELIVERY_FIELDS:
        if key == "quantity_unit":
            continue
        value = _format_delivery_field_value(fields, key)
        if not value:
            continue
        label = labels.get(key) or DEFAULT_FIELD_LABELS.get(key, key.replace("_", " ").title())
        lines.append(f"{label}: {value}")
    return lines


def format_duplicate_delivery_reply(
    existing: dict,
    employee_name: Optional[str],
) -> str:
    doc_no = existing.get("document_number") or "—"
    client = existing.get("client_name") or "unknown client"
    logged_by = existing.get("employee_name") or "a team member"
    submitted_by = f"\nYou: {employee_name}" if employee_name else ""
    return (
        f"ℹ️ Delivery note #{doc_no} was already saved ({client}).\n"
        f"First logged by: {logged_by}\n"
        "No duplicate was created."
        f"{submitted_by}"
    )


def format_delivery_confirmation(
    fields: dict,
    employee_name: Optional[str],
    status: str,
    audit: Optional[dict] = None,
) -> str:
    logged_by = f"\nLogged by: {employee_name}" if employee_name else ""
    doc_no = fields.get("document_number") or "—"

    blank_summary = None
    if audit:
        labels = audit.get("blank_field_labels") or []
        if labels:
            blank_summary = ", ".join(labels)

    receipt_lines = _delivery_receipt_lines(fields, audit)

    if status == "pending_review":
        msg = "⚠️ Delivery note saved for review.\n"
        if receipt_lines:
            msg += "\n" + "\n".join(receipt_lines)
        else:
            msg += "We could not read the form fields clearly."
        if audit and audit.get("error"):
            err = str(audit["error"])
            if "401" in err or "Unauthorized" in err:
                msg += "\n\n⚠️ WhatsApp token expired — admin must refresh WHATSAPP_ACCESS_TOKEN on Render."
            else:
                msg += f"\n\nReason: {err[:200]}"
        if blank_summary:
            msg += f"\n\nLeft blank on form: {blank_summary}"
        return msg + logged_by

    header = f"✅ Delivery note #{doc_no} saved\n"
    if receipt_lines:
        msg = header + "\n".join(receipt_lines)
    else:
        msg = header + "No fields could be read from the photo."
    if fields.get("line_total_fcfa"):
        msg += f"\nGoods value: {fields['line_total_fcfa']:,} FCFA"
    if blank_summary:
        msg += f"\n\n⚠️ Left blank on form: {blank_summary}"
    return msg + logged_by


async def check_whatsapp_token() -> dict:
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        return {"configured": False, "token_valid": False}
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}"
    headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
        return {
            "configured": True,
            "token_valid": response.status_code == 200,
            "status_code": response.status_code,
        }
    except Exception as exc:
        logger.exception("WhatsApp token check failed")
        return {"configured": True, "token_valid": False, "error": str(exc)}


async def send_whatsapp_text(to_phone: str, body: str) -> bool:
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        return False

    url = (
        f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/"
        f"{WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": body},
    }
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            logger.error(
                "WhatsApp send failed to %s: HTTP %s %s",
                to_phone,
                response.status_code,
                response.text[:300],
            )
        return response.status_code == 200


async def send_whatsapp_action_menu(to_phone: str, employee_name: str) -> bool:
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        return False

    url = (
        f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/"
        f"{WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": format_action_menu_prompt(employee_name)},
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {"id": "action_cash", "title": "Cash update"},
                    },
                    {
                        "type": "reply",
                        "reply": {"id": "action_delivery", "title": "Delivery photo"},
                    },
                ]
            },
        },
    }
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            logger.error(
                "WhatsApp menu send failed to %s: HTTP %s %s",
                to_phone,
                response.status_code,
                response.text[:300],
            )
            return await send_whatsapp_text(to_phone, format_action_menu_prompt(employee_name))
        return True
