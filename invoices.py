"""Sales invoices — create, list, and print."""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, ensure_default_business, get_db_connection

COMPANY_NAME = (os.environ.get("BUSINESS_NAME") or "RR Foods SARL").strip()
COMPANY_ADDRESS = (os.environ.get("BUSINESS_ADDRESS") or "").strip()
COMPANY_PHONE = (os.environ.get("BUSINESS_PHONE") or "").strip()
COMPANY_EMAIL = (os.environ.get("BUSINESS_EMAIL") or "").strip()

PUBLIC_BASE_URL = (
    os.environ.get("PUBLIC_BASE_URL") or "https://whatsapp-accounting.onrender.com"
).strip().rstrip("/")

# Invoice payment status values
STATUS_PAID = "paid"
STATUS_CREDIT = "unpaid"


def invoice_public_url(invoice_id: int) -> str:
    return f"{PUBLIC_BASE_URL}/invoices/{invoice_id}/print"


def get_company_profile() -> dict[str, str]:
    return {
        "name": COMPANY_NAME,
        "address": COMPANY_ADDRESS,
        "phone": COMPANY_PHONE,
        "email": COMPANY_EMAIL,
    }


def _line_total(quantity: Decimal, unit_price_fcfa: int) -> int:
    total = quantity * Decimal(unit_price_fcfa)
    return int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def ensure_invoices_table() -> None:
    ensure_default_business()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            invoice_number TEXT UNIQUE NOT NULL,
            party_id INTEGER REFERENCES parties(id),
            party_name TEXT NOT NULL,
            invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
            due_date DATE,
            currency TEXT NOT NULL DEFAULT 'XAF',
            status TEXT NOT NULL DEFAULT 'issued',
            notes TEXT,
            linked_receipt_id TEXT,
            total_fcfa INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_lines (
            id SERIAL PRIMARY KEY,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            line_order INTEGER NOT NULL DEFAULT 0,
            description TEXT NOT NULL,
            quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
            unit TEXT,
            unit_price_fcfa INTEGER NOT NULL,
            line_total_fcfa INTEGER NOT NULL,
            product_id INTEGER REFERENCES products(id)
        );
        """
    )
    conn.commit()
    cur.close()
    conn.close()


def _format_invoice_number(invoice_id: int) -> str:
    return f"INV-{invoice_id:06d}"


def _serialize_invoice(row: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "invoice_number": row["invoice_number"],
        "party_id": row.get("party_id"),
        "party_name": row["party_name"],
        "invoice_date": str(row["invoice_date"]),
        "due_date": str(row["due_date"]) if row.get("due_date") else None,
        "currency": row.get("currency") or "XAF",
        "status": row.get("status") or "issued",
        "notes": row.get("notes"),
        "linked_receipt_id": row.get("linked_receipt_id"),
        "total_fcfa": int(row.get("total_fcfa") or 0),
        "created_at": str(row.get("created_at") or ""),
        "lines": [
            {
                "id": line["id"],
                "description": line["description"],
                "quantity": float(line["quantity"]),
                "unit": line.get("unit"),
                "unit_price_fcfa": int(line["unit_price_fcfa"]),
                "line_total_fcfa": int(line["line_total_fcfa"]),
                "product_id": line.get("product_id"),
            }
            for line in lines
        ],
    }


def create_invoice(
    *,
    party_id: int,
    invoice_date: date,
    lines: list[dict[str, Any]],
    due_date: Optional[date] = None,
    notes: Optional[str] = None,
    linked_receipt_id: Optional[str] = None,
    status: str = "issued",
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    if not lines:
        raise ValueError("At least one line item is required")

    ensure_invoices_table()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, name FROM parties
            WHERE business_id = %s AND id = %s
            LIMIT 1;
            """,
            (business_id, party_id),
        )
        party = cur.fetchone()
        if not party:
            raise ValueError("Client not found")

        placeholder = f"INV-{uuid.uuid4().hex[:12].upper()}"
        cur.execute(
            """
            INSERT INTO invoices
            (business_id, invoice_number, party_id, party_name, invoice_date, due_date,
             currency, status, notes, linked_receipt_id, total_fcfa)
            VALUES (%s, %s, %s, %s, %s, %s, 'XAF', %s, %s, %s, 0)
            RETURNING id;
            """,
            (
                business_id,
                placeholder,
                party_id,
                party["name"],
                invoice_date,
                due_date,
                status,
                notes,
                linked_receipt_id,
            ),
        )
        invoice_id = cur.fetchone()["id"]
        invoice_number = _format_invoice_number(invoice_id)
        cur.execute(
            "UPDATE invoices SET invoice_number = %s WHERE id = %s;",
            (invoice_number, invoice_id),
        )

        total_fcfa = 0
        for index, line in enumerate(lines):
            description = (line.get("description") or "").strip()
            if not description:
                raise ValueError("Each line needs a description")
            quantity = Decimal(str(line.get("quantity") or 1))
            if quantity <= 0:
                raise ValueError("Quantity must be positive")
            unit_price = int(line.get("unit_price_fcfa") or 0)
            if unit_price < 0:
                raise ValueError("Unit price cannot be negative")
            line_total = _line_total(quantity, unit_price)
            total_fcfa += line_total
            cur.execute(
                """
                INSERT INTO invoice_lines
                (invoice_id, line_order, description, quantity, unit,
                 unit_price_fcfa, line_total_fcfa, product_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    invoice_id,
                    index,
                    description,
                    quantity,
                    (line.get("unit") or "").strip() or None,
                    unit_price,
                    line_total,
                    line.get("product_id"),
                ),
            )

        cur.execute(
            "UPDATE invoices SET total_fcfa = %s WHERE id = %s;",
            (total_fcfa, invoice_id),
        )
        conn.commit()

        cur.execute("SELECT * FROM invoices WHERE id = %s;", (invoice_id,))
        invoice_row = dict(cur.fetchone())
        cur.execute(
            """
            SELECT * FROM invoice_lines
            WHERE invoice_id = %s
            ORDER BY line_order ASC, id ASC;
            """,
            (invoice_id,),
        )
        line_rows = [dict(row) for row in cur.fetchall()]
        return _serialize_invoice(invoice_row, line_rows)
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def list_invoices(
    *,
    limit: int = 100,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> list[dict[str, Any]]:
    ensure_invoices_table()
    limit = max(1, min(limit, 500))
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, invoice_number, party_id, party_name, invoice_date, due_date,
               currency, status, notes, linked_receipt_id, total_fcfa, created_at
        FROM invoices
        WHERE business_id = %s
        ORDER BY id DESC
        LIMIT %s;
        """,
        (business_id, limit),
    )
    rows = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return [
        {
            **row,
            "invoice_date": str(row["invoice_date"]),
            "due_date": str(row["due_date"]) if row.get("due_date") else None,
            "total_fcfa": int(row.get("total_fcfa") or 0),
            "created_at": str(row.get("created_at") or ""),
        }
        for row in rows
    ]


def get_invoice(
    invoice_id: int,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> Optional[dict[str, Any]]:
    ensure_invoices_table()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT * FROM invoices
        WHERE business_id = %s AND id = %s
        LIMIT 1;
        """,
        (business_id, invoice_id),
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return None
    cur.execute(
        """
        SELECT * FROM invoice_lines
        WHERE invoice_id = %s
        ORDER BY line_order ASC, id ASC;
        """,
        (invoice_id,),
    )
    lines = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return _serialize_invoice(dict(row), lines)


def format_invoice_date_label(value: str | date | datetime | None) -> str:
    if not value:
        return "—"
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return str(value)
