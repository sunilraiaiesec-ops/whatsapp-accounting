import calendar
from datetime import date
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection
from parties import list_parties_with_balances
from review import get_review_counts


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)
    return start, end


def _period_label(year: int, month: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def get_monthly_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    today = date.today()
    year = year or today.year
    month = month or today.month
    if month < 1 or month > 12:
        raise ValueError("month must be 1-12")

    start, end = _month_bounds(year, month)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE
                WHEN transaction_type = 'receipt' AND status = 'confirmed'
                THEN amount ELSE 0 END), 0) AS total_receipts,
            COALESCE(SUM(CASE
                WHEN transaction_type = 'expense' AND status = 'confirmed'
                THEN amount ELSE 0 END), 0) AS total_expenses,
            COALESCE(SUM(CASE
                WHEN transaction_type IN ('payment', 'return_payment') AND status = 'confirmed'
                THEN amount ELSE 0 END), 0) AS total_payments,
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
            COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_count
        FROM transactions
        WHERE business_id = %s
          AND created_at >= %s::date
          AND created_at < (%s::date + interval '1 month');
        """,
        (business_id, start.isoformat(), start.isoformat()),
    )
    cash = dict(cur.fetchone())

    cur.execute(
        """
        SELECT
            c.id, c.name, c.slug, c.category_type,
            COALESCE(SUM(t.amount), 0) AS total_amount,
            COUNT(t.id) AS transaction_count
        FROM categories c
        LEFT JOIN transactions t ON t.category_id = c.id
            AND t.business_id = %s
            AND t.status = 'confirmed'
            AND t.created_at >= %s::date
            AND t.created_at < (%s::date + interval '1 month')
        WHERE c.business_id = %s AND c.is_active = TRUE
        GROUP BY c.id, c.name, c.slug, c.category_type, c.sort_order
        HAVING COUNT(t.id) > 0
        ORDER BY c.category_type ASC, total_amount DESC;
        """,
        (business_id, start.isoformat(), start.isoformat(), business_id),
    )
    category_rows = cur.fetchall()

    cur.execute(
        """
        SELECT
            COUNT(*) AS delivery_count,
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
            COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_count,
            COALESCE(SUM(quantity) FILTER (WHERE status = 'confirmed'), 0) AS total_quantity,
            COALESCE(SUM(line_total_fcfa) FILTER (WHERE status = 'confirmed'), 0) AS total_goods_value
        FROM delivery_notes
        WHERE business_id = %s
          AND created_at >= %s::date
          AND created_at < (%s::date + interval '1 month');
        """,
        (business_id, start.isoformat(), start.isoformat()),
    )
    deliveries = dict(cur.fetchone())

    cur.execute(
        """
        SELECT
            p.name AS client_name,
            COUNT(dn.id) AS delivery_count,
            COALESCE(SUM(dn.quantity), 0) AS total_quantity,
            COALESCE(SUM(dn.line_total_fcfa), 0) AS total_goods_value
        FROM delivery_notes dn
        JOIN parties p ON p.id = dn.party_id
        WHERE dn.business_id = %s
          AND dn.status = 'confirmed'
          AND dn.created_at >= %s::date
          AND dn.created_at < (%s::date + interval '1 month')
        GROUP BY p.id, p.name
        ORDER BY total_quantity DESC
        LIMIT 10;
        """,
        (business_id, start.isoformat(), start.isoformat()),
    )
    deliveries_by_client = [dict(row) for row in cur.fetchall()]

    cur.close()
    conn.close()

    expense_rows = [dict(r) for r in category_rows if r["category_type"] == "expense"]
    income_rows = [dict(r) for r in category_rows if r["category_type"] == "income"]
    for group in (expense_rows, income_rows):
        for row in group:
            row["total_amount"] = int(row["total_amount"])
            row["transaction_count"] = int(row["transaction_count"])

    total_receipts = int(cash["total_receipts"] or 0)
    total_expenses = int(cash["total_expenses"] or 0)
    total_payments = int(cash["total_payments"] or 0)

    parties = list_parties_with_balances(business_id=business_id)
    top_owed = sorted(
        [p for p in parties if int(p.get("amount_owed") or 0) > 0],
        key=lambda p: int(p["amount_owed"]),
        reverse=True,
    )[:10]

    review = get_review_counts(business_id=business_id)

    return {
        "year": year,
        "month": month,
        "period_label": _period_label(year, month),
        "cash": {
            "total_receipts": total_receipts,
            "total_expenses": total_expenses,
            "total_payments": total_payments,
            "net_cash": total_receipts - total_expenses - total_payments,
            "confirmed_transactions": int(cash["confirmed_count"] or 0),
            "pending_transactions": int(cash["pending_count"] or 0),
        },
        "categories": {
            "expenses": expense_rows,
            "income": income_rows,
            "total_expenses": sum(r["total_amount"] for r in expense_rows),
            "total_income": sum(r["total_amount"] for r in income_rows),
        },
        "deliveries": {
            "delivery_count": int(deliveries["delivery_count"] or 0),
            "confirmed_count": int(deliveries["confirmed_count"] or 0),
            "pending_count": int(deliveries["pending_count"] or 0),
            "total_quantity": int(deliveries["total_quantity"] or 0),
            "total_goods_value": int(deliveries["total_goods_value"] or 0),
            "by_client": [
                {
                    **row,
                    "delivery_count": int(row["delivery_count"]),
                    "total_quantity": int(row["total_quantity"]),
                    "total_goods_value": int(row["total_goods_value"]),
                }
                for row in deliveries_by_client
            ],
        },
        "top_parties_owed": [
            {
                "id": p["id"],
                "name": p["name"],
                "amount_owed": int(p["amount_owed"]),
                "total_goods_value": int(p.get("total_goods_value") or 0),
                "total_received": int(p.get("total_received") or 0),
            }
            for p in top_owed
        ],
        "review_queue": review,
    }
