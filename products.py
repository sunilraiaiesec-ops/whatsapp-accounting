import re
import unicodedata
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection


def normalize_product_name(name: Optional[str]) -> str:
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", name.strip())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def find_or_create_product(
    cur,
    description: Optional[str],
    quantity_unit: Optional[str] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> Optional[int]:
    if not description or not description.strip():
        return None

    cleaned = description.strip()
    normalized = normalize_product_name(cleaned)
    unit = (quantity_unit or "").strip() or None

    cur.execute(
        """
        SELECT id FROM products
        WHERE business_id = %s AND normalized_name = %s
        LIMIT 1;
        """,
        (business_id, normalized),
    )
    row = cur.fetchone()
    if row:
        product_id = row[0]
        if unit:
            cur.execute(
                """
                UPDATE products SET default_unit = COALESCE(default_unit, %s)
                WHERE id = %s AND default_unit IS NULL;
                """,
                (unit, product_id),
            )
        return product_id

    cur.execute(
        """
        INSERT INTO products (business_id, name, normalized_name, default_unit)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (business_id, cleaned, normalized, unit),
    )
    return cur.fetchone()[0]


def compute_line_total(
    quantity: Optional[int],
    unit_price_fcfa: Optional[int],
    default_unit_price_fcfa: Optional[int] = None,
) -> tuple[Optional[int], Optional[int]]:
    effective_price = unit_price_fcfa or default_unit_price_fcfa
    if quantity is None or effective_price is None:
        return effective_price, None
    return effective_price, quantity * effective_price


def prepare_delivery_product_fields(
    cur,
    fields: dict,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict:
    product_id = find_or_create_product(
        cur,
        fields.get("description"),
        fields.get("quantity_unit"),
        business_id=business_id,
    )
    default_price = None
    if product_id:
        cur.execute(
            "SELECT default_unit_price_fcfa FROM products WHERE id = %s;",
            (product_id,),
        )
        row = cur.fetchone()
        if row:
            default_price = row[0]

    unit_price = fields.get("unit_price_fcfa")
    effective_price, line_total = compute_line_total(
        fields.get("quantity"),
        unit_price,
        default_price,
    )
    return {
        "product_id": product_id,
        "unit_price_fcfa": effective_price,
        "line_total_fcfa": line_total,
    }


def backfill_delivery_products(business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, description, quantity, quantity_unit, unit_price_fcfa
        FROM delivery_notes
        WHERE business_id = %s
          AND (product_id IS NULL OR line_total_fcfa IS NULL)
          AND description IS NOT NULL
          AND TRIM(description) <> '';
        """,
        (business_id,),
    )
    for delivery_id, description, quantity, quantity_unit, unit_price in cur.fetchall():
        fields = {
            "description": description,
            "quantity": quantity,
            "quantity_unit": quantity_unit,
            "unit_price_fcfa": unit_price,
        }
        meta = prepare_delivery_product_fields(cur, fields, business_id=business_id)
        cur.execute(
            """
            UPDATE delivery_notes
            SET product_id = %s,
                unit_price_fcfa = %s,
                line_total_fcfa = %s
            WHERE id = %s;
            """,
            (
                meta["product_id"],
                meta["unit_price_fcfa"],
                meta["line_total_fcfa"],
                delivery_id,
            ),
        )
    conn.commit()
    cur.close()
    conn.close()


def recalculate_product_delivery_totals(
    product_id: int,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> int:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT default_unit_price_fcfa FROM products WHERE id = %s AND business_id = %s;",
        (product_id, business_id),
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        cur.close()
        conn.close()
        return 0

    default_price = row[0]
    cur.execute(
        """
        UPDATE delivery_notes
        SET unit_price_fcfa = %s,
            line_total_fcfa = quantity * %s
        WHERE business_id = %s
          AND product_id = %s
          AND quantity IS NOT NULL
          AND status = 'confirmed';
        """,
        (default_price, default_price, business_id, product_id),
    )
    updated = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return updated


def list_products(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            p.id, p.name, p.default_unit, p.default_unit_price_fcfa, p.created_at,
            COUNT(dn.id) AS delivery_count,
            COALESCE(SUM(dn.quantity), 0) AS total_quantity_delivered
        FROM products p
        LEFT JOIN delivery_notes dn ON dn.product_id = p.id AND dn.business_id = p.business_id
        WHERE p.business_id = %s
        GROUP BY p.id, p.name, p.default_unit, p.default_unit_price_fcfa, p.created_at
        ORDER BY p.name ASC;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {
            **dict(row),
            "delivery_count": int(row["delivery_count"]),
            "total_quantity_delivered": int(row["total_quantity_delivered"]),
        }
        for row in rows
    ]


def update_product_price(
    product_id: int,
    default_unit_price_fcfa: Optional[int],
    business_id: int = DEFAULT_BUSINESS_ID,
) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        UPDATE products
        SET default_unit_price_fcfa = %s
        WHERE id = %s AND business_id = %s
        RETURNING id, name, default_unit, default_unit_price_fcfa;
        """,
        (default_unit_price_fcfa, product_id, business_id),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not row:
        return None
    if default_unit_price_fcfa is not None:
        recalculate_product_delivery_totals(product_id, business_id=business_id)
    return dict(row)


def get_weekly_deliveries_by_client(
    business_id: int = DEFAULT_BUSINESS_ID,
) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            p.id AS party_id,
            p.name AS client_name,
            COUNT(dn.id) AS delivery_count,
            COALESCE(SUM(dn.quantity), 0) AS total_quantity,
            COALESCE(SUM(dn.line_total_fcfa), 0) AS total_goods_value
        FROM delivery_notes dn
        JOIN parties p ON p.id = dn.party_id
        WHERE dn.business_id = %s
          AND dn.created_at >= date_trunc('week', CURRENT_TIMESTAMP)
          AND dn.status = 'confirmed'
        GROUP BY p.id, p.name
        ORDER BY total_quantity DESC, client_name ASC;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {
            **dict(row),
            "delivery_count": int(row["delivery_count"]),
            "total_quantity": int(row["total_quantity"]),
            "total_goods_value": int(row["total_goods_value"]),
        }
        for row in rows
    ]
