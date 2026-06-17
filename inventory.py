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
    cur.execute(
        "ALTER TABLE stock_movements "
        "ADD COLUMN IF NOT EXISTS unit_cost_fcfa NUMERIC(14, 4);"
    )
    conn.commit()
    cur.close()
    conn.close()


def _coerce_qty(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("Quantity must be a number") from exc


def _coerce_cost(value: Any) -> Optional[Decimal]:
    """Optional unit cost. Returns None when blank; raises on invalid/negative."""
    if value is None or value == "":
        return None
    try:
        cost = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("Unit cost must be a number") from exc
    if cost < 0:
        raise ValueError("Unit cost cannot be negative")
    return cost


def _average_cost(cur, product_id: int, business_id: int) -> Decimal:
    """Weighted-average unit cost from costed inbound movements (excludes
    movements with no cost so quantity-only WhatsApp receipts don't drag it down)."""
    cur.execute(
        """
        SELECT
            COALESCE(SUM(quantity)
                FILTER (WHERE quantity > 0 AND unit_cost_fcfa IS NOT NULL), 0),
            COALESCE(SUM(quantity * unit_cost_fcfa)
                FILTER (WHERE quantity > 0 AND unit_cost_fcfa IS NOT NULL), 0)
        FROM stock_movements
        WHERE product_id = %s AND business_id = %s;
        """,
        (product_id, business_id),
    )
    qty_raw, val_raw = cur.fetchone()
    qty = Decimal(str(qty_raw or 0))
    val = Decimal(str(val_raw or 0))
    if qty <= 0:
        return Decimal(0)
    return val / qty


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


def search_products(
    term: str, business_id: int = DEFAULT_BUSINESS_ID, limit: int = 8
) -> list[dict[str, Any]]:
    """Find existing products by (accent-insensitive) name substring."""
    from products import normalize_product_name

    normalized = normalize_product_name(term)
    if not normalized:
        return []
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, name, default_unit
        FROM products
        WHERE business_id = %s AND normalized_name ILIKE %s
        ORDER BY name ASC
        LIMIT %s;
        """,
        (business_id, f"%{normalized}%", limit),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {"id": row["id"], "name": row["name"], "unit": row["default_unit"]}
        for row in rows
    ]


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


def get_valuation(business_id: int = DEFAULT_BUSINESS_ID) -> dict[str, Any]:
    """Weighted-average inventory valuation: per product on-hand x avg cost,
    plus all-time COGS (sum of cost locked on outbound movements)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            p.id,
            p.name,
            p.default_unit,
            COALESCE(SUM(m.quantity), 0) AS on_hand,
            COALESCE(SUM(m.quantity)
                FILTER (WHERE m.quantity > 0 AND m.unit_cost_fcfa IS NOT NULL), 0)
                AS costed_in_qty,
            COALESCE(SUM(m.quantity * m.unit_cost_fcfa)
                FILTER (WHERE m.quantity > 0 AND m.unit_cost_fcfa IS NOT NULL), 0)
                AS costed_in_val,
            COALESCE(SUM(-m.quantity * m.unit_cost_fcfa)
                FILTER (WHERE m.quantity < 0 AND m.unit_cost_fcfa IS NOT NULL), 0)
                AS cogs_val,
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
    total_value = Decimal(0)
    total_cogs = Decimal(0)
    for row in rows:
        on_hand = Decimal(str(row["on_hand"] or 0))
        in_qty = Decimal(str(row["costed_in_qty"] or 0))
        in_val = Decimal(str(row["costed_in_val"] or 0))
        cogs = Decimal(str(row["cogs_val"] or 0))
        avg_cost = (in_val / in_qty) if in_qty > 0 else Decimal(0)
        value = on_hand * avg_cost
        total_value += value
        total_cogs += cogs
        items.append(
            {
                "id": row["id"],
                "name": row["name"],
                "default_unit": row["default_unit"],
                "on_hand": float(on_hand),
                "avg_cost": float(round(avg_cost, 2)),
                "stock_value": float(round(value)),
                "movement_count": int(row["movement_count"] or 0),
            }
        )
    return {
        "items": items,
        "count": len(items),
        "total_stock_value": float(round(total_value)),
        "total_cogs": float(round(total_cogs)),
    }


def set_opening_balance(
    product_id: int,
    quantity: Any,
    *,
    unit: Optional[str] = None,
    unit_cost: Any = None,
    note: Optional[str] = None,
    employee_id: Optional[int] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    """Set (or correct) the opening count for a product. Idempotent per product."""
    qty = _coerce_qty(quantity)
    cost = _coerce_cost(unit_cost)
    ensure_stock_movements_table()
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        resolved_unit = unit or _product_unit(cur, product_id, business_id)
        cur.execute(
            """
            INSERT INTO stock_movements
                (business_id, product_id, quantity, unit, movement_type,
                 source_type, source_id, note, employee_id, unit_cost_fcfa)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_type, source_id)
            WHERE source_type IS NOT NULL AND source_id IS NOT NULL
            DO UPDATE SET
                quantity = EXCLUDED.quantity,
                unit = EXCLUDED.unit,
                note = EXCLUDED.note,
                employee_id = EXCLUDED.employee_id,
                unit_cost_fcfa = EXCLUDED.unit_cost_fcfa,
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
                cost,
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
    unit_cost: Any = None,
    note: Optional[str] = None,
    employee_id: Optional[int] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    """Record goods received (stock in). Always inserts a new movement."""
    qty = _coerce_qty(quantity)
    if qty <= 0:
        raise ValueError("Quantity must be positive")
    cost = _coerce_cost(unit_cost)
    ensure_stock_movements_table()
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        resolved_unit = unit or _product_unit(cur, product_id, business_id)
        cur.execute(
            """
            INSERT INTO stock_movements
                (business_id, product_id, quantity, unit, movement_type,
                 source_type, source_id, note, employee_id, unit_cost_fcfa)
            VALUES (%s, %s, %s, %s, %s, 'manual', NULL, %s, %s, %s)
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
                cost,
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
    # Lock COGS at the current weighted-average cost (0 -> store NULL = uncosted).
    avg_cost = _average_cost(cur, product_id, business_id)
    cost = avg_cost if avg_cost > 0 else None
    cur.execute(
        """
        INSERT INTO stock_movements
            (business_id, product_id, quantity, unit, movement_type,
             source_type, source_id, employee_id, unit_cost_fcfa)
        VALUES (%s, %s, %s, %s, %s, 'delivery', %s, %s, %s)
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
            cost,
        ),
    )
