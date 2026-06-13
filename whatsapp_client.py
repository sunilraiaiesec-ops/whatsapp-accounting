import os
from typing import Optional

import httpx

WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_API_VERSION = os.environ.get("WHATSAPP_API_VERSION", "v21.0")


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
