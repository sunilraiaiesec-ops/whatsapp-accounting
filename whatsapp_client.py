import os
from typing import Optional

import httpx

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
        "⛔ This phone number is not registered to log business transactions.\n"
        "Please contact your business admin to be added to the team."
    )


def format_delivery_unauthorized_reply() -> str:
    return (
        "⛔ Only owners and warehouse managers can submit delivery note photos.\n"
        "Please send text money updates in this format:\n"
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
        if blank_summary:
            msg += f"\n\nLeft blank on form: {blank_summary}"
        return msg + logged_by

    header = f"✅ Delivery note #{doc_no} saved\n"
    if receipt_lines:
        msg = header + "\n".join(receipt_lines)
    else:
        msg = header + "No fields could be read from the photo."
    if blank_summary:
        msg += f"\n\n⚠️ Left blank on form: {blank_summary}"
    return msg + logged_by


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
        return response.status_code == 200
