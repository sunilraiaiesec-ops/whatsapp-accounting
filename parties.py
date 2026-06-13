import re
import unicodedata
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection

RECEIVED_TYPES = ("receipt",)
PAID_TYPES = ("expense", "payment", "return_payment")


def normalize_party_name(name: Optional[str]) -> str:
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", name.strip())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def infer_party_type(transaction_type: Optional[str] = None, *, is_delivery_client: bool = False) -> str:
    if is_delivery_client:
        return "customer"
    if transaction_type in RECEIVED_TYPES:
        return "customer"
    if transaction_type in PAID_TYPES:
        return "supplier"
    return "both"


def merge_party_type(existing: Optional[str], new_type: str) -> str:
    existing = existing or "both"
    if existing == new_type or "both" in (existing, new_type):
        return "both"
    return "both"


def find_or_create_party(
    cur,
    name: str,
    business_id: int = DEFAULT_BUSINESS_ID,
    party_type: str = "both",
) -> Optional[int]:
    cleaned = name.strip()
    normalized = normalize_party_name(cleaned)
    if not normalized:
        return None

    cur.execute(
        """
        SELECT id, party_type FROM parties
        WHERE business_id = %s AND normalized_name = %s
        LIMIT 1;
        """,
        (business_id, normalized),
    )
    row = cur.fetchone()
    if row:
        party_id, existing_type = row[0], row[1]
        merged = merge_party_type(existing_type, party_type)
        if merged != existing_type:
            cur.execute(
                "UPDATE parties SET party_type = %s WHERE id = %s;",
                (merged, party_id),
            )
        return party_id

    cur.execute(
        """
        INSERT INTO parties (business_id, name, normalized_name, party_type)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (business_id, cleaned, normalized, party_type),
    )
    return cur.fetchone()[0]


def resolve_party_for_transaction(cur, party_name: Optional[str], transaction_type: str) -> Optional[int]:
    if not party_name or not party_name.strip():
        return None
    return find_or_create_party(
        cur,
        party_name,
        party_type=infer_party_type(transaction_type),
    )


def resolve_party_for_delivery(cur, client_name: Optional[str]) -> Optional[int]:
    if not client_name or not client_name.strip():
        return None
    return find_or_create_party(
        cur,
        client_name,
        party_type=infer_party_type(is_delivery_client=True),
    )


def backfill_party_links(business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, party, transaction_type
        FROM transactions
        WHERE business_id = %s
          AND party_id IS NULL
          AND party IS NOT NULL
          AND TRIM(party) <> '';
        """,
        (business_id,),
    )
    for tx_id, party, tx_type in cur.fetchall():
        party_id = resolve_party_for_transaction(cur, party, tx_type or "unknown")
        if party_id:
            cur.execute(
                "UPDATE transactions SET party_id = %s WHERE id = %s;",
                (party_id, tx_id),
            )

    cur.execute(
        """
        SELECT id, client_name
        FROM delivery_notes
        WHERE business_id = %s
          AND party_id IS NULL
          AND client_name IS NOT NULL
          AND TRIM(client_name) <> '';
        """,
        (business_id,),
    )
    for delivery_id, client_name in cur.fetchall():
        party_id = resolve_party_for_delivery(cur, client_name)
        if party_id:
            cur.execute(
                "UPDATE delivery_notes SET party_id = %s WHERE id = %s;",
                (party_id, delivery_id),
            )

    conn.commit()
    cur.close()
    conn.close()


def _party_balance_sql() -> str:
    return """
        SELECT
            p.id,
            p.name,
            p.party_type,
            p.created_at,
            COALESCE(tx.total_received, 0) AS total_received,
            COALESCE(tx.total_paid, 0) AS total_paid,
            COALESCE(tx.transaction_count, 0) AS transaction_count,
            COALESCE(dn.delivery_count, 0) AS delivery_count,
            COALESCE(dn.total_quantity, 0) AS total_quantity_delivered
        FROM parties p
        LEFT JOIN (
            SELECT
                party_id,
                COALESCE(SUM(CASE
                    WHEN transaction_type IN ('receipt') AND status = 'confirmed'
                    THEN amount ELSE 0 END), 0) AS total_received,
                COALESCE(SUM(CASE
                    WHEN transaction_type IN ('expense', 'payment', 'return_payment')
                         AND status = 'confirmed'
                    THEN amount ELSE 0 END), 0) AS total_paid,
                COUNT(*) AS transaction_count
            FROM transactions
            WHERE business_id = %s AND party_id IS NOT NULL
            GROUP BY party_id
        ) tx ON tx.party_id = p.id
        LEFT JOIN (
            SELECT
                party_id,
                COUNT(*) AS delivery_count,
                COALESCE(SUM(quantity), 0) AS total_quantity
            FROM delivery_notes
            WHERE business_id = %s AND party_id IS NOT NULL
            GROUP BY party_id
        ) dn ON dn.party_id = p.id
        WHERE p.business_id = %s
    """


def list_parties_with_balances(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        _party_balance_sql() + " ORDER BY p.name ASC;",
        (business_id, business_id, business_id),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    result = []
    for row in rows:
        total_received = int(row["total_received"] or 0)
        total_paid = int(row["total_paid"] or 0)
        result.append({
            **dict(row),
            "net_cash": total_received - total_paid,
            "total_received": total_received,
            "total_paid": total_paid,
            "transaction_count": int(row["transaction_count"] or 0),
            "delivery_count": int(row["delivery_count"] or 0),
            "total_quantity_delivered": int(row["total_quantity_delivered"] or 0),
        })
    return result


def get_party_detail(party_id: int, business_id: int = DEFAULT_BUSINESS_ID) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        _party_balance_sql() + " AND p.id = %s LIMIT 1;",
        (business_id, business_id, business_id, party_id),
    )
    party = cur.fetchone()
    if not party:
        cur.close()
        conn.close()
        return None

    total_received = int(party["total_received"] or 0)
    total_paid = int(party["total_paid"] or 0)

    cur.execute(
        """
        SELECT id, transaction_type, amount, currency, category, status,
               original_message, created_at
        FROM transactions
        WHERE business_id = %s AND party_id = %s
        ORDER BY id DESC
        LIMIT 100;
        """,
        (business_id, party_id),
    )
    transactions = cur.fetchall()

    cur.execute(
        """
        SELECT id, document_number, client_name, description, quantity,
               quantity_unit, total_weight, status, created_at
        FROM delivery_notes
        WHERE business_id = %s AND party_id = %s
        ORDER BY id DESC
        LIMIT 100;
        """,
        (business_id, party_id),
    )
    deliveries = cur.fetchall()

    cur.close()
    conn.close()

    return {
        **dict(party),
        "net_cash": total_received - total_paid,
        "total_received": total_received,
        "total_paid": total_paid,
        "transactions": [dict(row) for row in transactions],
        "deliveries": [dict(row) for row in deliveries],
    }


def insert_transaction(
    cur,
    parsed: dict,
    sender: str,
    employee_id: Optional[int],
    status: str,
    business_id: int = DEFAULT_BUSINESS_ID,
    whatsapp_message_id: Optional[str] = None,
) -> tuple[int, Optional[int]]:
    party_id = resolve_party_for_transaction(cur, parsed.get("party"), parsed.get("type") or "unknown")
    cur.execute(
        """
        INSERT INTO transactions
        (business_id, transaction_type, party, party_id, amount, currency, category,
         original_message, sender, employee_id, status, whatsapp_message_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            business_id,
            parsed["type"],
            parsed["party"],
            party_id,
            parsed["amount"],
            parsed["currency"],
            parsed["category"],
            parsed["original_message"],
            sender,
            employee_id,
            status,
            whatsapp_message_id,
        ),
    )
    return cur.fetchone()[0], party_id


def format_party_balance_line(party_id: int, business_id: int = DEFAULT_BUSINESS_ID) -> Optional[str]:
    detail = get_party_detail(party_id, business_id)
    if not detail:
        return None
    net = detail["net_cash"]
    name = detail["name"]
    if net > 0:
        return f"{name} balance: {net:,} FCFA received from them (net)"
    if net < 0:
        return f"{name} balance: {abs(net):,} FCFA paid to them (net)"
    return f"{name} balance: 0 FCFA (even)"
