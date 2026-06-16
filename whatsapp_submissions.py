"""Persist structured WhatsApp accounting submissions."""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, ensure_default_business, get_db_connection


def ensure_accounting_submissions_table() -> None:
    ensure_default_business()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS accounting_submissions (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            employee_id INTEGER REFERENCES employees(id),
            sender TEXT NOT NULL,
            submission_type TEXT NOT NULL,
            receipt_id TEXT UNIQUE NOT NULL,
            amount INTEGER,
            payload JSONB NOT NULL,
            whatsapp_message_id TEXT,
            proof_media_id TEXT,
            status TEXT DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        ALTER TABLE accounting_submissions
        ALTER COLUMN receipt_id DROP NOT NULL;
        """
    )
    conn.commit()
    cur.close()
    conn.close()


def _format_receipt_id(submission_id: int) -> str:
    return f"RR-{submission_id:06d}"


def _json_safe(data: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(data, default=str))


def save_submission(
    *,
    employee_id: int,
    sender: str,
    submission_type: str,
    amount: Optional[int],
    payload: dict[str, Any],
    whatsapp_message_id: Optional[str] = None,
    proof_media_id: Optional[str] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> tuple[int, str]:
    ensure_accounting_submissions_table()
    safe_payload = _json_safe(payload)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        placeholder_receipt = f"RR-{uuid.uuid4().hex[:12].upper()}"
        cur.execute(
            """
            INSERT INTO accounting_submissions
            (business_id, employee_id, sender, submission_type, receipt_id,
             amount, payload, whatsapp_message_id, proof_media_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                business_id,
                employee_id,
                sender,
                submission_type,
                placeholder_receipt,
                amount,
                psycopg2.extras.Json(safe_payload),
                whatsapp_message_id,
                proof_media_id,
            ),
        )
        submission_id = cur.fetchone()[0]
        receipt_id = _format_receipt_id(submission_id)
        cur.execute(
            "UPDATE accounting_submissions SET receipt_id = %s WHERE id = %s;",
            (receipt_id, submission_id),
        )
        cur.execute(
            """
            INSERT INTO messages
            (business_id, source, sender, message_text, raw_data, whatsapp_message_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (whatsapp_message_id) DO NOTHING;
            """,
            (
                business_id,
                "whatsapp",
                sender,
                f"[{submission_type}] Receipt {receipt_id}",
                json.dumps(
                    {
                        "submission_type": submission_type,
                        "receipt_id": receipt_id,
                        **_json_safe(safe_payload),
                    },
                    default=str,
                ),
                whatsapp_message_id,
            ),
        )
        conn.commit()
        return submission_id, receipt_id
    finally:
        cur.close()
        conn.close()
