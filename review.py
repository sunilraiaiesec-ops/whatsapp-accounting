from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection
from parties import resolve_party_for_delivery
from products import prepare_delivery_product_fields


def get_review_counts(business_id: int = DEFAULT_BUSINESS_ID) -> dict[str, int]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM transactions
             WHERE business_id = %s AND status = 'pending_review') AS pending_transactions,
            (SELECT COUNT(*) FROM delivery_notes
             WHERE business_id = %s AND status = 'pending_review') AS pending_deliveries;
        """,
        (business_id, business_id),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    pending_tx, pending_dn = row
    return {
        "pending_transactions": int(pending_tx or 0),
        "pending_deliveries": int(pending_dn or 0),
        "total": int(pending_tx or 0) + int(pending_dn or 0),
    }


def list_pending_transactions(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            t.id, t.transaction_type, t.party, t.party_id, t.amount, t.currency,
            t.category, t.original_message, t.status, t.created_at,
            e.name AS employee_name
        FROM transactions t
        LEFT JOIN employees e ON e.id = t.employee_id
        WHERE t.business_id = %s AND t.status = 'pending_review'
        ORDER BY t.id DESC;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(row) for row in rows]


def list_pending_deliveries(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            d.id, d.document_number, d.client_name, d.delivery_date,
            d.description, d.quantity, d.quantity_unit, d.total_weight,
            d.truck_number, d.driver_name, d.driver_phone, d.route_note,
            d.party_id, d.line_total_fcfa, d.unit_price_fcfa, d.status,
            d.extraction_raw, d.created_at, e.name AS employee_name,
            pr.name AS product_name
        FROM delivery_notes d
        LEFT JOIN employees e ON e.id = d.employee_id
        LEFT JOIN products pr ON pr.id = d.product_id
        WHERE d.business_id = %s AND d.status = 'pending_review'
        ORDER BY d.id DESC;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        raw = item.get("extraction_raw") or {}
        item["extraction_error"] = raw.get("error")
        item["blank_field_labels"] = raw.get("blank_field_labels") or []
        result.append(item)
    return result


def confirm_transaction(
    transaction_id: int,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE transactions
        SET status = 'confirmed'
        WHERE id = %s AND business_id = %s AND status = 'pending_review'
        RETURNING id;
        """,
        (transaction_id, business_id),
    )
    updated = cur.fetchone() is not None
    conn.commit()
    cur.close()
    conn.close()
    return updated


def reject_transaction(
    transaction_id: int,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE transactions
        SET status = 'rejected'
        WHERE id = %s AND business_id = %s AND status = 'pending_review'
        RETURNING id;
        """,
        (transaction_id, business_id),
    )
    updated = cur.fetchone() is not None
    conn.commit()
    cur.close()
    conn.close()
    return updated


def confirm_delivery_note(
    delivery_id: int,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> Optional[int]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, client_name, party_id, description, quantity, quantity_unit, unit_price_fcfa
        FROM delivery_notes
        WHERE id = %s AND business_id = %s AND status = 'pending_review';
        """,
        (delivery_id, business_id),
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return None

    _id, client_name, party_id, description, quantity, quantity_unit, unit_price = row
    party_id = party_id or resolve_party_for_delivery(cur, client_name)
    fields = {
        "description": description,
        "quantity": quantity,
        "quantity_unit": quantity_unit,
        "unit_price_fcfa": unit_price,
    }
    product_meta = prepare_delivery_product_fields(cur, fields, business_id=business_id)

    cur.execute(
        """
        UPDATE delivery_notes
        SET status = 'confirmed',
            party_id = %s,
            product_id = %s,
            unit_price_fcfa = %s,
            line_total_fcfa = %s
        WHERE id = %s AND business_id = %s
        RETURNING id;
        """,
        (
            party_id,
            product_meta["product_id"],
            product_meta["unit_price_fcfa"],
            product_meta["line_total_fcfa"],
            delivery_id,
            business_id,
        ),
    )
    updated = cur.fetchone()

    if updated and product_meta["product_id"] and quantity:
        from inventory import record_delivery_movement

        record_delivery_movement(
            cur,
            product_id=product_meta["product_id"],
            quantity=quantity,
            unit=quantity_unit,
            delivery_id=delivery_id,
            business_id=business_id,
        )

    conn.commit()
    cur.close()
    conn.close()
    return updated[0] if updated else None


def reject_delivery_note(
    delivery_id: int,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE delivery_notes
        SET status = 'rejected'
        WHERE id = %s AND business_id = %s AND status = 'pending_review'
        RETURNING id;
        """,
        (delivery_id, business_id),
    )
    updated = cur.fetchone() is not None
    conn.commit()
    cur.close()
    conn.close()
    return updated
