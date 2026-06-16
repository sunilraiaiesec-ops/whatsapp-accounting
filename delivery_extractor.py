import base64
import json
import os
import re
from typing import Any, Optional, Tuple

import httpx

GOOGLE_API_KEY = (os.environ.get("GOOGLE_API_KEY") or "").strip() or None
GEMINI_MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash").strip()
GEMINI_FALLBACK_MODELS = [
    GEMINI_MODEL,
    "gemini-2.5-flash",
]

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

DEFAULT_FIELD_LABELS = {
    "document_number": "Document No.",
    "document_type": "Document Type",
    "route_note": "Route",
    "client_name": "Client Name",
    "delivery_date": "Delivery Date",
    "description": "Description",
    "quantity": "Quantity",
    "quantity_unit": "Quantity Unit",
    "unit_weight": "Unit Weight",
    "total_weight": "Total Weight",
    "truck_number": "Truck No.",
    "driver_name": "Driver Name",
    "driver_phone": "Driver Phone",
    "driver_id_number": "Driver ID",
    "transporter": "Transporter",
    "delivered_at": "Delivered At",
}

EXTRACTION_PROMPT = """You are reading a goods delivery note photo for RR FOODS SARL (Cameroon).
The form has printed headings/labels with handwritten or typed values beside them.

Return ONLY valid JSON with this structure:
{
  "document_number": "string or null",
  "document_type": "string or null",
  "route_note": "string or null",
  "client_name": "string or null",
  "delivery_date": "string or null",
  "description": "string or null",
  "quantity": number or null,
  "quantity_unit": "string or null",
  "unit_weight": "string or null",
  "total_weight": "string or null",
  "truck_number": "string or null",
  "driver_name": "string or null",
  "driver_phone": "string or null",
  "driver_id_number": "string or null",
  "transporter": "string or null",
  "delivered_at": "string or null",
  "field_labels": {
    "document_number": "exact printed heading on form",
    "client_name": "exact printed heading on form",
    "...": "one entry per field key listed above"
  },
  "blank_on_form": ["field_key", "..."]
}

Rules for values:
- Use null when the value area is empty, illegible, or not filled in
- document_type is usually "Goods Delivery Note"
- quantity should be a number only (e.g. 1280), not text
- Keep filled names and text exactly as written on the form
- delivery_date as written on form (e.g. 09/06/2026)

Rules for field_labels (IMPORTANT):
- For EVERY field whose printed heading/label is visible on the form, add an entry to field_labels
- Copy the heading text exactly as printed (English or French), e.g. "Client Name", "Nom du client", "Qty", "Poids total"
- Include labels even when the warehouse manager left that field blank

Rules for blank_on_form (IMPORTANT):
- List field keys where the printed label IS visible on the form BUT no value was written in
- Example: if "Driver Phone" label is printed but the phone box is empty, include "driver_phone"
- Do NOT list fields that are not visible on this form at all
- Use the same keys as the value fields above
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


def parse_form_audit(raw: dict) -> dict:
    labels = raw.get("field_labels") or {}
    if not isinstance(labels, dict):
        labels = {}

    blank_keys = raw.get("blank_on_form") or []
    if not isinstance(blank_keys, list):
        blank_keys = []

    normalized_labels: dict[str, str] = {}
    for field in DELIVERY_FIELDS:
        label = labels.get(field)
        if isinstance(label, str) and label.strip():
            normalized_labels[field] = label.strip()
        elif field in labels:
            normalized_labels[field] = DEFAULT_FIELD_LABELS[field]

    blank_on_form = []
    for key in blank_keys:
        if isinstance(key, str) and key in DELIVERY_FIELDS and key not in blank_on_form:
            blank_on_form.append(key)

    blank_field_labels = [
        normalized_labels.get(field) or DEFAULT_FIELD_LABELS[field]
        for field in blank_on_form
    ]

    return {
        "field_labels": normalized_labels,
        "blank_on_form": blank_on_form,
        "blank_field_labels": blank_field_labels,
    }


def blank_fields_summary(audit: dict) -> Optional[str]:
    labels = audit.get("blank_field_labels") or []
    if not labels:
        return None
    return ", ".join(labels)


def delivery_status(fields: dict) -> str:
    if not GOOGLE_API_KEY:
        return "pending_review"
    if fields.get("client_name") and (
        fields.get("document_number") or fields.get("quantity")
    ):
        return "confirmed"
    return "pending_review"


async def check_gemini_api() -> dict:
    if not GOOGLE_API_KEY:
        return {"configured": False, "api_ok": False, "model": GEMINI_MODEL}
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY,
    }
    payload = {
        "contents": [{"parts": [{"text": "Reply with OK"}]}],
        "generationConfig": {"maxOutputTokens": 8},
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload, headers=headers)
        return {
            "configured": True,
            "api_ok": response.status_code == 200,
            "model": GEMINI_MODEL,
            "status_code": response.status_code,
            "error": None if response.status_code == 200 else response.text[:200],
        }
    except Exception as exc:
        return {
            "configured": True,
            "api_ok": False,
            "model": GEMINI_MODEL,
            "error": str(exc),
        }


async def _call_gemini(payload: dict, model: str) -> httpx.Response:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY or "",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        return await client.post(url, json=payload, headers=headers)


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

    models_to_try = []
    for model in GEMINI_FALLBACK_MODELS:
        if model and model not in models_to_try:
            models_to_try.append(model)

    last_error: dict[str, Any] = {}
    data: dict[str, Any] = {}
    model_used = GEMINI_MODEL

    for model in models_to_try:
        model_used = model
        response = await _call_gemini(payload, model)
        if response.status_code == 200:
            data = response.json()
            break
        last_error = {
            "error": f"Gemini API error {response.status_code}",
            "details": response.text[:500],
            "model": model,
            "caption": caption,
        }
    else:
        empty = {field: None for field in DELIVERY_FIELDS}
        return empty, last_error

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        raw = _parse_json_from_text(text)
        fields = normalize_delivery_fields(raw)
        audit = parse_form_audit(raw)
        return fields, {
            "raw_response": raw,
            "caption": caption,
            "model": model_used,
            **audit,
        }
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        empty = {field: None for field in DELIVERY_FIELDS}
        return empty, {
            "error": f"Failed to parse Gemini response: {exc}",
            "response": data,
            "model": model_used,
            "caption": caption,
        }
