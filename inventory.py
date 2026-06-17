"""Inventory — quantity-only stock movements and on-hand levels (Phase 1).

On-hand is always derived as SUM(quantity) over stock_movements; we never store a
mutable quantity-on-hand column. Movements are append-only. The two source-based
movement kinds (opening balance, delivery-out) are idempotent via a partial unique
index on (source_type, source_id).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, ensure_default_business, get_db_connection

MOVEMENT_OPENING = "opening"
MOVEMENT_RECEIPT = "receipt"
MOVEMENT_DELIVERY = "delivery"
MOVEMENT_ADJUSTMENT = "adjustment"
MOVEMENT_RETURN = "return"


def ensure_stock_movements_table() -> None:
    ensure_default_business()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS stock_movements (
            id            SERIAL PRIMARY KEY,
            business_id   INTEGER REFERENCES businesses(id),
            product_id    INTEGER NOT NULL REFERENCES products(id),
            quantity      NUMERIC(14, 3) NOT NULL,
            unit          TEXT,
            movement_type TEXT NOT NULL,
            source_type   TEXT,
            source_id     INTEGER,
            note          TEXT,
            employee_id   INTEGER REFERENCES employees(id),
            movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_source_unique
        ON stock_movements (source_type, source_id)
        WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
        """
    )
    conn.commit()
    cur.close()
    conn.close()


def _coerce_qty(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("Quantity must be a number") from exc


def _product_unit(cur, product_id: int, business_id: int) -> Optional[str]:
    cur.execute(
        "SELECT default_unit FROM products WHERE id = %s AND business_id = %s;",
        (product_id, business_id),
    )
    row = cur.fetchone()
    if row is None:
        raise ValueError("Product not found")
    return row[0]


def _on_hand(cur, product_id: int, business_id: int) -> float:
    cur.execute(
        """
        SELECT COALESCE(SUM(quantity), 0)
        FROM stock_movements
        WHERE product_id = %s AND business_id = %s;
        """,
        (product_id, business_id),
    )
    return float(cur.fetchone()[0] or 0)


def list_on_hand(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            p.id,
            p.name,
            p.default_unit,
            COALESCE(SUM(m.quantity), 0) AS on_hand,
            COUNT(m.id) AS movement_count
        FROM products p
        LEFT JOIN stock_movements m
            ON m.product_id = p.id AND m.business_id = %s
        WHERE p.business_id = %s
        GROUP BY p.id, p.name, p.default_unit
        ORDER BY p.name ASC;
        """,
        (business_id, business_id),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["on_hand"] = float(item.get("on_hand") or 0)
        item["movement_count"] = int(item.get("movement_count") or 0)
        items.append(item)
    return items


def set_opening_balance(
    product_id: int,
    quantity: Any,
    *,
    unit: Optional[str] = None,
    note: Optional[str] = None,
    employee_id: Optional[int] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    """Set (or correct) the opening count for a product. Idempotent per product."""
    qty = _coerce_qty(quantity)
    ensure_stock_movements_table()
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        resolved_unit = unit or _product_unit(cur, product_id, business_id)
        cur.execute(
            """
            INSERT INTO stock_movements
                (business_id, product_id, quantity, unit, movement_type,
                 source_type, source_id, note, employee_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_type, source_id)
            WHERE source_type IS NOT NULL AND source_id IS NOT NULL
            DO UPDATE SET
                quantity = EXCLUDED.quantity,
                unit = EXCLUDED.unit,
                note = EXCLUDED.note,
                employee_id = EXCLUDED.employee_id,
                movement_date = CURRENT_DATE;
            """,
            (
                business_id,
                product_id,
                qty,
                resolved_unit,
                MOVEMENT_OPENING,
                MOVEMENT_OPENING,
                product_id,
                note,
                employee_id,
            ),
        )
        on_hand = _on_hand(cur, product_id, business_id)
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return {"product_id": product_id, "on_hand": on_hand}


def record_receipt(
    product_id: int,
    quantity: Any,
    *,
    unit: Optional[str] = None,
    note: Optional[str] = None,
    employee_id: Optional[int] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    """Record goods received (stock in). Always inserts a new movement."""
    qty = _coerce_qty(quantity)
    if qty <= 0:
        raise ValueError("Quantity must be positive")
    ensure_stock_movements_table()
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        resolved_unit = unit or _product_unit(cur, product_id, business_id)
        cur.execute(
            """
            INSERT INTO stock_movements
                (business_id, product_id, quantity, unit, movement_type,
                 source_type, source_id, note, employee_id)
            VALUES (%s, %s, %s, %s, %s, 'manual', NULL, %s, %s)
            RETURNING id;
            """,
            (
                business_id,
                product_id,
                qty,
                resolved_unit,
                MOVEMENT_RECEIPT,
                note,
                employee_id,
            ),
        )
        movement_id = cur.fetchone()[0]
        on_hand = _on_hand(cur, product_id, business_id)
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return {"id": movement_id, "product_id": product_id, "on_hand": on_hand}


def record_delivery_movement(
    cur,
    *,
    product_id: Optional[int],
    quantity: Any,
    delivery_id: int,
    unit: Optional[str] = None,
    employee_id: Optional[int] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> None:
    """Insert a stock-out movement for a confirmed delivery, within the caller's
    transaction. Idempotent: re-confirming the same delivery will not double-count."""
    if not product_id or quantity is None:
        return
    try:
        qty = _coerce_qty(quantity)
    except ValueError:
        return
    if qty <= 0:
        return
    cur.execute(
        """
        INSERT INTO stock_movements
            (business_id, product_id, quantity, unit, movement_type,
             source_type, source_id, employee_id)
        VALUES (%s, %s, %s, %s, %s, 'delivery', %s, %s)
        ON CONFLICT (source_type, source_id)
        WHERE source_type IS NOT NULL AND source_id IS NOT NULL
        DO NOTHING;
        """,
        (
            business_id,
            product_id,
            -qty,
            unit,
            MOVEMENT_DELIVERY,
            delivery_id,
            employee_id,
        ),
    )
