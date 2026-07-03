"""Brim personal credit-card receipt capture.

This is a separate, self-contained path from the RR Foods accounting flow.
Inbound WhatsApp messages from numbers listed in ``BRIM_HOUSEHOLD_PHONES`` are
routed here *before* the employee/PIN gate, so the household never touches the
business logic.

Phase 1 (this file): household routing + intake stub.
Phase 2 (this file): ``brim_charges`` / ``brim_receipts`` schema + helpers.
Phase 3 (notifier):  the Brim email notifier writes each charge into
                     ``brim_charges`` so receipts can be matched to a charge.
Phase 4 (later):     OCR extraction, charge matching, confirm-before-store.

The entire feature is inert unless ``BRIM_HOUSEHOLD_PHONES`` is set, so leaving
it unset keeps the existing flows byte-for-byte unchanged.
"""

from __future__ import annotations

import logging
import os
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import psycopg2.extras

from db import (
    DEFAULT_BUSINESS_ID,
    ensure_default_business,
    get_db_connection,
    normalize_phone,
)
from whatsapp_client import send_whatsapp_text

logger = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Phase 1: household routing
# ---------------------------------------------------------------------------

def brim_household_phones() -> set[str]:
    """Normalized phone numbers allowed to use the Brim receipt path."""
    raw = os.environ.get("BRIM_HOUSEHOLD_PHONES") or ""
    return {normalize_phone(part) for part in raw.split(",") if part.strip()}


def is_brim_household(phone: Optional[str]) -> bool:
    if not phone:
        return False
    return normalize_phone(phone) in brim_household_phones()


def _extract_image_media(message: dict) -> Optional[tuple[str, str, Optional[str]]]:
    """Return (media_id, mime_type, caption) for image / image-document messages."""
    message_type = message.get("type")
    if message_type == "image":
        image = message.get("image", {})
        media_id = image.get("id")
        if media_id:
            return media_id, image.get("mime_type", "image/jpeg"), image.get("caption")
    if message_type == "document":
        doc = message.get("document", {})
        mime = (doc.get("mime_type") or "").lower()
        if mime.startswith("image/") and doc.get("id"):
            return doc.get("id"), mime, doc.get("caption")
    return None


async def handle_brim_inbound(payload: dict[str, Any]) -> dict[str, Any]:
    """Entry point for messages from Brim household members.

    Phase 1 acknowledges the message so the sender gets feedback and we never
    fall through to the RR Foods employee/PIN flow. OCR, charge matching, and
    the confirm-before-store review step arrive in Phase 4.
    """
    sender = payload["sender"]
    message = payload["message"]
    message_type = payload.get("message_type")
    media = _extract_image_media(message)

    if media:
        logger.info("Brim receipt photo received from %s (media_id=%s)", sender, media[0])
        await send_whatsapp_text(
            sender,
            "Got your receipt. Automatic reading is being set up and will be "
            "enabled shortly. It is safely noted for now.",
        )
        return {"status": "brim_receipt_received", "phase": "intake_stub"}

    text_body = None
    if message_type == "text":
        text_body = (message.get("text", {}) or {}).get("body")

    logger.info("Brim household message from %s (type=%s)", sender, message_type)
    await send_whatsapp_text(
        sender,
        "Thanks! When you get a Brim charge alert, just reply with a photo of "
        "the receipt and I'll record it.",
    )
    return {"status": "brim_text_ack", "text": text_body}


# ---------------------------------------------------------------------------
# Phase 2: schema + helpers
# ---------------------------------------------------------------------------

CHARGE_STATUS_AWAITING = "awaiting_receipt"
CHARGE_STATUS_RECEIVED = "received"
CHARGE_STATUS_NO_RECEIPT = "no_receipt"

RECEIPT_STATUS_PENDING = "pending_confirmation"
RECEIPT_STATUS_CONFIRMED = "confirmed"
RECEIPT_STATUS_REJECTED = "rejected"
RECEIPT_STATUS_DUPLICATE = "duplicate"


def ensure_brim_tables() -> None:
    """Create the Brim charge/receipt tables. Safe to call on every startup."""
    ensure_default_business()
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS brim_charges (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            merchant TEXT,
            amount_cents INTEGER,
            currency TEXT,
            is_international BOOLEAN DEFAULT FALSE,
            card_last4 TEXT,
            charged_at TIMESTAMP,
            source_email_id TEXT UNIQUE,
            alert_message_id TEXT,
            status TEXT DEFAULT 'awaiting_receipt',
            raw JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS brim_receipts (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            charge_id INTEGER REFERENCES brim_charges(id),
            submitted_by TEXT,
            submitter_name TEXT,
            whatsapp_message_id TEXT UNIQUE,
            media_id TEXT,
            image_sha256 TEXT,
            merchant TEXT,
            receipt_date TEXT,
            total_cents INTEGER,
            currency TEXT,
            category TEXT,
            line_items JSONB,
            review_status TEXT DEFAULT 'pending_confirmation',
            extraction_raw JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    cur.execute(
        "CREATE INDEX IF NOT EXISTS brim_charges_status_idx "
        "ON brim_charges (business_id, status);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS brim_receipts_charge_idx "
        "ON brim_receipts (charge_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS brim_receipts_hash_idx "
        "ON brim_receipts (business_id, image_sha256);"
    )

    conn.commit()
    cur.close()
    conn.close()


def _to_cents(amount: Any) -> Optional[int]:
    if amount is None:
        return None
    try:
        return int((Decimal(str(amount)) * 100).to_integral_value())
    except (InvalidOperation, ValueError, TypeError):
        return None


def insert_brim_charge(
    *,
    merchant: Optional[str],
    amount: Any,
    currency: Optional[str],
    is_international: bool = False,
    card_last4: Optional[str] = None,
    charged_at: Optional[str] = None,
    source_email_id: Optional[str] = None,
    alert_message_id: Optional[str] = None,
    raw: Optional[dict] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> Optional[int]:
    """Record a Brim charge. Idempotent on ``source_email_id``.

    Returns the charge id, or ``None`` if it already existed.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO brim_charges
                (business_id, merchant, amount_cents, currency, is_international,
                 card_last4, charged_at, source_email_id, alert_message_id, status, raw)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_email_id) DO NOTHING
            RETURNING id;
            """,
            (
                business_id,
                merchant,
                _to_cents(amount),
                currency,
                is_international,
                card_last4,
                charged_at,
                source_email_id,
                alert_message_id,
                CHARGE_STATUS_AWAITING,
                psycopg2.extras.Json(raw or {}),
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return row[0] if row else None
    finally:
        cur.close()
        conn.close()


def list_awaiting_charges(
    limit: int = 20, business_id: int = DEFAULT_BUSINESS_ID
) -> list[dict]:
    """Charges still waiting for a receipt, newest first (for matching/reminders)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, merchant, amount_cents, currency, is_international,
                   card_last4, charged_at, alert_message_id, status, created_at
            FROM brim_charges
            WHERE business_id = %s AND status = %s
            ORDER BY COALESCE(charged_at, created_at) DESC
            LIMIT %s;
            """,
            (business_id, CHARGE_STATUS_AWAITING, limit),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()
