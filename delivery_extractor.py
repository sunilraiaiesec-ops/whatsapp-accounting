import base64
import json
import os
import re
from typing import Any, Optional, Tuple

import httpx

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

DELIVERY_FIELDS = [
    "document_number",
    "document_type",
    "route_note",
    "client_name",
    "delivery_date",
    "description",
    "quantity",
    "quantity_unit",
    "unit_weight",
    "total_weight",
    "truck_number",
    "driver_name",
    "driver_phone",
    "driver_id_number",
    "transporter",
    "delivered_at",
]

EXTRACTION_PROMPT = """You are reading a goods delivery note photo for RR FOODS SARL (Cameroon).
Extract all handwritten and printed fields from this delivery note form.

Return ONLY valid JSON with these keys (use null if missing or blank):
{
  "document_number": "string",
  "document_type": "string",
  "route_note": "string",
  "client_name": "string",
  "delivery_date": "string",
  "description": "string",
  "quantity": number or null,
  "quantity_unit": "string",
  "unit_weight": "string",
  "total_weight": "string",
  "truck_number": "string",
  "driver_name": "string",
  "driver_phone": "string",
  "driver_id_number": "string",
  "transporter": "string",
  "delivered_at": "string"
}

Rules:
- document_type is usually "Goods Delivery Note"
- quantity should be a number only (e.g. 1280), not text
- Keep names and text exactly as written on the form
- delivery_date as written on form (e.g. 09/06/2026)
"""


def _parse_json_from_text(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def normalize_delivery_fields(raw: dict) -> dict:
    result: dict[str, Any] = {}
    for field in DELIVERY_FIELDS:
        value = raw.get(field)
        if field == "quantity" and value is not None:
            if isinstance(value, str):
                digits = re.sub(r"[^\d]", "", value)
                value = int(digits) if digits else None
            elif isinstance(value, float):
                value = int(value)
        if isinstance(value, str):
            value = value.strip() or None
        result[field] = value
    return result


def delivery_status(fields: dict) -> str:
    if not GOOGLE_API_KEY:
        return "pending_review"
    if fields.get("client_name") and (
        fields.get("document_number") or fields.get("quantity")
    ):
        return "confirmed"
    return "pending_review"


async def extract_delivery_note(
    image_bytes: bytes,
    mime_type: str,
    caption: Optional[str] = None,
) -> Tuple[dict, dict]:
    if not GOOGLE_API_KEY:
        empty = {field: None for field in DELIVERY_FIELDS}
        return empty, {
            "error": "GOOGLE_API_KEY not configured",
            "caption": caption,
        }

    prompt = EXTRACTION_PROMPT
    if caption:
        prompt += f"\n\nWhatsApp caption from sender: {caption}"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            error_body = response.text
            empty = {field: None for field in DELIVERY_FIELDS}
            return empty, {
                "error": f"Gemini API error {response.status_code}",
                "details": error_body[:500],
                "model": GEMINI_MODEL,
                "caption": caption,
            }
        data = response.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        raw = _parse_json_from_text(text)
        fields = normalize_delivery_fields(raw)
        return fields, {"raw_response": raw, "caption": caption, "model": GEMINI_MODEL}
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        empty = {field: None for field in DELIVERY_FIELDS}
        return empty, {
            "error": f"Failed to parse Gemini response: {exc}",
            "response": data,
            "model": GEMINI_MODEL,
            "caption": caption,
        }
