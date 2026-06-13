import re
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection


def normalize_document_number(document_number: Optional[str]) -> Optional[str]:
    if not document_number or not str(document_number).strip():
        return None
    digits = re.sub(r"\D", "", document_number)
    if len(digits) >= 3:
        return str(int(digits))
    cleaned = re.sub(r"\s+", " ", document_number.strip().upper())
    return cleaned or None


def find_existing_delivery_by_document(
    document_number: Optional[str],
    business_id: int = DEFAULT_BUSINESS_ID,
) -> Optional[dict[str, Any]]:
    normalized = normalize_document_number(document_number)
    if not normalized:
        return None

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            d.id, d.document_number, d.client_name, d.status, d.created_at,
            e.name AS employee_name
        FROM delivery_notes d
        LEFT JOIN employees e ON e.id = d.employee_id
        WHERE d.business_id = %s
          AND d.status != 'rejected'
          AND d.document_number_normalized = %s
        ORDER BY d.id ASC
        LIMIT 1;
        """,
        (business_id, normalized),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def backfill_document_number_normalized(business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, document_number
        FROM delivery_notes
        WHERE business_id = %s
          AND document_number IS NOT NULL
          AND trim(document_number) <> ''
          AND document_number_normalized IS NULL;
        """,
        (business_id,),
    )
    for delivery_id, document_number in cur.fetchall():
        normalized = normalize_document_number(document_number)
        if not normalized:
            continue
        cur.execute(
            """
            UPDATE delivery_notes
            SET document_number_normalized = %s
            WHERE id = %s AND document_number_normalized IS NULL;
            """,
            (normalized, delivery_id),
        )
    conn.commit()
    cur.close()
    conn.close()
