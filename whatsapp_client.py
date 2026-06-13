import os
from typing import Optional

import httpx

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


def format_confirmation(parsed: dict, employee_name: Optional[str], status: str) -> str:
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
        f"{logged_by}"
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


def format_delivery_confirmation(
    fields: dict,
    employee_name: Optional[str],
    status: str,
    audit: Optional[dict] = None,
) -> str:
    logged_by = f"\nLogged by: {employee_name}" if employee_name else ""
    client = fields.get("client_name") or "unknown client"
    doc_no = fields.get("document_number") or "—"
    qty = fields.get("quantity")
    unit = fields.get("quantity_unit") or ""
    qty_text = f"{qty:,} {unit}".strip() if qty else "quantity unknown"

    blank_summary = None
    if audit:
        labels = audit.get("blank_field_labels") or []
        if labels:
            blank_summary = ", ".join(labels)

    if status == "pending_review":
        msg = (
            "⚠️ Delivery note photo saved for review.\n"
            "We could not read all fields clearly. An admin will check it."
        )
        if blank_summary:
            msg += f"\n\nLeft blank on form: {blank_summary}"
        return msg + logged_by

    msg = (
        f"✅ Delivery note #{doc_no} saved\n"
        f"Client: {client}\n"
        f"Qty: {qty_text}"
    )
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
