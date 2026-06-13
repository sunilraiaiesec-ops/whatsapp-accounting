import re
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection

INCOME_TYPES = ("receipt",)
EXPENSE_TYPES = ("expense", "payment", "return_payment")

DEFAULT_CATEGORIES = [
    ("Transport", "transport", "expense", "transport,fuel,diesel,taxi,camion,truck,fret,livraison", 10),
    ("Rice purchase", "rice", "expense", "rice,riz,achat riz,grain", 20),
    ("Warehouse", "warehouse", "expense", "warehouse,entrepot,storage,loading,unload,manutention,depot", 30),
    ("Salary", "salary", "expense", "salary,salaire,wage,payroll,paie", 40),
    ("Marketing", "marketing", "expense", "marketing,pub,advertisement,promo,publicite", 50),
    ("Rent", "rent", "expense", "rent,loyer,bail", 60),
    ("Sales", "sales", "income", "sales,sale,vente,invoice,facture", 10),
    ("Other income", "other_income", "income", "", 900),
    ("Other expense", "other_expense", "expense", "", 900),
]

SLUG_ALIASES = {
    "loading": "warehouse",
}


def _category_kind(transaction_type: Optional[str]) -> str:
    if transaction_type in INCOME_TYPES:
        return "income"
    return "expense"


def _parse_keywords(keywords: Optional[str]) -> list[str]:
    if not keywords:
        return []
    return [part.strip().lower() for part in keywords.split(",") if part.strip()]


def seed_categories(business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    for name, slug, category_type, keywords, sort_order in DEFAULT_CATEGORIES:
        cur.execute(
            """
            INSERT INTO categories (business_id, name, slug, category_type, keywords, sort_order)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (business_id, slug) DO NOTHING;
            """,
            (business_id, name, slug, category_type, keywords, sort_order),
        )
    conn.commit()
    cur.close()
    conn.close()


def _load_categories(cur, business_id: int, category_kind: str) -> list[dict]:
    cur.execute(
        """
        SELECT id, name, slug, category_type, keywords, sort_order
        FROM categories
        WHERE business_id = %s
          AND category_type = %s
          AND is_active = TRUE
        ORDER BY sort_order ASC, name ASC;
        """,
        (business_id, category_kind),
    )
    return [dict(row) for row in cur.fetchall()]


def resolve_category(
    cur,
    message: str,
    transaction_type: Optional[str],
    hint_slug: Optional[str] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> tuple[Optional[int], Optional[str]]:
    category_kind = _category_kind(transaction_type)
    categories = _load_categories(cur, business_id, category_kind)
    if not categories:
        return None, hint_slug

    if hint_slug:
        hint_slug = SLUG_ALIASES.get(hint_slug, hint_slug)
        for cat in categories:
            if cat["slug"] == hint_slug:
                return cat["id"], cat["name"]

    lower_message = (message or "").lower()
    for cat in categories:
        if cat["slug"].startswith("other_"):
            continue
        for keyword in _parse_keywords(cat["keywords"]):
            if keyword and keyword in lower_message:
                return cat["id"], cat["name"]

    fallback_slug = "other_income" if category_kind == "income" else "other_expense"
    for cat in categories:
        if cat["slug"] == fallback_slug:
            return cat["id"], cat["name"]

    return categories[-1]["id"], categories[-1]["name"]


def apply_category_to_parsed(
    cur,
    parsed: dict,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict:
    category_id, category_name = resolve_category(
        cur,
        parsed.get("original_message") or "",
        parsed.get("type"),
        hint_slug=parsed.get("category"),
        business_id=business_id,
    )
    if category_name:
        parsed["category"] = category_name
    parsed["category_id"] = category_id
    return parsed


def backfill_category_links(business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, original_message, transaction_type, category
        FROM transactions
        WHERE business_id = %s AND category_id IS NULL;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    for tx_id, message, tx_type, category in rows:
        hint = category.lower().replace(" ", "_") if category else None
        if hint in SLUG_ALIASES:
            hint = SLUG_ALIASES[hint]
        category_id, category_name = resolve_category(cur, message, tx_type, hint_slug=hint, business_id=business_id)
        if category_id:
            cur.execute(
                "UPDATE transactions SET category_id = %s, category = %s WHERE id = %s;",
                (category_id, category_name, tx_id),
            )
    conn.commit()
    cur.close()
    conn.close()


def list_categories(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, name, slug, category_type, keywords, sort_order, is_active
        FROM categories
        WHERE business_id = %s AND is_active = TRUE
        ORDER BY category_type ASC, sort_order ASC, name ASC;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(row) for row in rows]


def get_category_summary(
    business_id: int = DEFAULT_BUSINESS_ID,
    period: str = "month",
) -> dict[str, Any]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if period == "all":
        date_filter = ""
        params: list[Any] = [business_id, business_id]
    else:
        date_filter = "AND t.created_at >= date_trunc('month', CURRENT_TIMESTAMP)"
        params = [business_id, business_id]

    cur.execute(
        f"""
        SELECT
            c.id,
            c.name,
            c.slug,
            c.category_type,
            COALESCE(SUM(t.amount), 0) AS total_amount,
            COUNT(t.id) AS transaction_count
        FROM categories c
        LEFT JOIN transactions t ON t.category_id = c.id
            AND t.business_id = %s
            AND t.status = 'confirmed'
            {date_filter}
        WHERE c.business_id = %s AND c.is_active = TRUE
        GROUP BY c.id, c.name, c.slug, c.category_type, c.sort_order
        HAVING COUNT(t.id) > 0
        ORDER BY c.category_type ASC, total_amount DESC;
        """,
        params,
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    expense_rows = [dict(row) for row in rows if row["category_type"] == "expense"]
    income_rows = [dict(row) for row in rows if row["category_type"] == "income"]

    total_expenses = sum(int(row["total_amount"]) for row in expense_rows)
    total_income = sum(int(row["total_amount"]) for row in income_rows)

    for group in (expense_rows, income_rows):
        group_total = sum(int(row["total_amount"]) for row in group) or 1
        for row in group:
            row["total_amount"] = int(row["total_amount"])
            row["transaction_count"] = int(row["transaction_count"])
            row["share_pct"] = round(row["total_amount"] * 100 / group_total, 1)

    period_label = "This month" if period == "month" else "All time"

    return {
        "period": period,
        "period_label": period_label,
        "total_expenses": total_expenses,
        "total_income": total_income,
        "net": total_income - total_expenses,
        "expenses": expense_rows,
        "income": income_rows,
    }
