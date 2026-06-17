from typing import Any, Optional

import psycopg2.extras
from fastapi import APIRouter, HTTPException

from api_serializers import serialize_data
from categories import get_category_summary, list_categories
from db import DEFAULT_BUSINESS_ID, get_db_connection
from invoices import create_invoice, get_invoice, list_invoices
from models import InvoiceCreate, ProductUpdate
from parties import get_party_detail, list_parties_with_balances
from products import get_weekly_deliveries_by_client, list_products, update_product_price
from reports import get_monthly_report
from review import (
    confirm_delivery_note,
    confirm_transaction,
    get_review_counts,
    list_pending_deliveries,
    list_pending_transactions,
    reject_delivery_note,
    reject_transaction,
)

router = APIRouter(prefix="/api/v1", tags=["api-v1"])

API_INDEX = {
    "version": 1,
    "endpoints": {
        "summary": "GET /api/v1/summary",
        "transactions": "GET /api/v1/transactions",
        "deliveries": "GET /api/v1/deliveries",
        "parties": "GET /api/v1/parties",
        "party_detail": "GET /api/v1/parties/{party_id}",
        "categories": "GET /api/v1/categories",
        "category_summary": "GET /api/v1/categories/summary",
        "products": "GET /api/v1/products",
        "update_product": "PATCH /api/v1/products/{product_id}",
        "weekly_deliveries": "GET /api/v1/deliveries/weekly",
        "review_queue": "GET /api/v1/review",
        "monthly_report": "GET /api/v1/reports/monthly",
        "employees": "GET /api/v1/employees",
        "invoices": "GET /api/v1/invoices",
        "create_invoice": "POST /api/v1/invoices",
        "invoice_detail": "GET /api/v1/invoices/{invoice_id}",
    },
}


def _fetch_cash_summary(business_id: int = DEFAULT_BUSINESS_ID) -> dict[str, Any]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'receipt' THEN amount ELSE 0 END), 0)
                AS total_receipts,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
                AS total_expenses,
            COALESCE(SUM(CASE WHEN transaction_type = 'payment' THEN amount ELSE 0 END), 0)
                AS total_payments,
            COALESCE(SUM(CASE WHEN transaction_type = 'return_payment' THEN amount ELSE 0 END), 0)
                AS total_returns,
            COALESCE(SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END), 0)
                AS pending_transactions
        FROM transactions
        WHERE business_id = %s;
        """,
        (business_id,),
    )
    row = dict(cur.fetchone())
    cur.close()
    conn.close()

    total_receipts = int(row["total_receipts"] or 0)
    total_expenses = int(row["total_expenses"] or 0)
    total_payments = int(row["total_payments"] or 0)
    total_returns = int(row["total_returns"] or 0)
    return {
        "total_receipts": total_receipts,
        "total_expenses": total_expenses,
        "total_payments": total_payments,
        "total_returns": total_returns,
        "pending_transactions": int(row["pending_transactions"] or 0),
        "net_balance": total_receipts - total_expenses - total_payments - total_returns,
    }


def _fetch_transactions(
    *,
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    limit: int = 100,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    query = """
        SELECT
            t.id, t.transaction_type, t.party, t.party_id, t.amount, t.currency,
            t.category, t.original_message, t.sender, t.status, t.created_at,
            e.name AS employee_name
        FROM transactions t
        LEFT JOIN employees e ON e.id = t.employee_id
        WHERE t.business_id = %s
    """
    params: list[Any] = [business_id]

    if status:
        query += " AND t.status = %s"
        params.append(status)
    if employee_id:
        query += " AND t.employee_id = %s"
        params.append(employee_id)

    query += " ORDER BY t.id DESC LIMIT %s;"
    params.append(limit)

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(row) for row in rows]


def _fetch_deliveries(
    *,
    status: Optional[str] = None,
    limit: int = 100,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    query = """
        SELECT
            d.id, d.document_number, d.document_type, d.client_name, d.delivery_date,
            d.description, d.quantity, d.quantity_unit, d.unit_weight, d.total_weight,
            d.truck_number, d.driver_name, d.driver_phone, d.route_note, d.status,
            d.party_id, d.line_total_fcfa, d.unit_price_fcfa, d.created_at,
            e.name AS employee_name,
            pr.name AS product_name
        FROM delivery_notes d
        LEFT JOIN employees e ON e.id = d.employee_id
        LEFT JOIN products pr ON pr.id = d.product_id
        WHERE d.business_id = %s
    """
    params: list[Any] = [business_id]

    if status:
        query += " AND d.status = %s"
        params.append(status)

    query += " ORDER BY d.id DESC LIMIT %s;"
    params.append(limit)

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(row) for row in rows]


def _fetch_employees(business_id: int = DEFAULT_BUSINESS_ID) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, phone, name, role, is_active, created_at
        FROM employees
        WHERE business_id = %s
        ORDER BY name ASC;
        """,
        (business_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(row) for row in rows]


@router.get("")
def api_index():
    return API_INDEX


@router.get("/summary")
def api_summary():
    cash = _fetch_cash_summary()
    review = get_review_counts()
    return serialize_data({"cash": cash, "review": review})


@router.get("/transactions")
def api_transactions(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    limit: int = 100,
):
    rows = _fetch_transactions(status=status, employee_id=employee_id, limit=limit)
    return serialize_data({"items": rows, "count": len(rows)})


@router.get("/deliveries")
def api_deliveries(status: Optional[str] = None, limit: int = 100):
    rows = _fetch_deliveries(status=status, limit=limit)
    return serialize_data({"items": rows, "count": len(rows)})


@router.get("/deliveries/weekly")
def api_weekly_deliveries():
    return serialize_data(get_weekly_deliveries_by_client())


@router.get("/parties")
def api_parties():
    parties = list_parties_with_balances()
    return serialize_data({"items": parties, "count": len(parties)})


@router.get("/parties/{party_id}")
def api_party_detail(party_id: int):
    party = get_party_detail(party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return serialize_data(party)


@router.get("/categories")
def api_categories():
    categories = list_categories()
    return serialize_data({"items": categories, "count": len(categories)})


@router.get("/categories/summary")
def api_category_summary(period: str = "month"):
    if period not in ("month", "all"):
        period = "month"
    return serialize_data(get_category_summary(period=period))


@router.get("/products")
def api_products():
    products = list_products()
    return serialize_data({"items": products, "count": len(products)})


@router.patch("/products/{product_id}")
def api_update_product(product_id: int, data: ProductUpdate):
    if data.default_unit_price_fcfa is None:
        raise HTTPException(status_code=400, detail="default_unit_price_fcfa is required")
    if data.default_unit_price_fcfa < 0:
        raise HTTPException(status_code=400, detail="Price must be zero or positive")
    product = update_product_price(product_id, data.default_unit_price_fcfa)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return serialize_data(product)


@router.get("/review")
def api_review_queue():
    return serialize_data(
        {
            "counts": get_review_counts(),
            "transactions": list_pending_transactions(),
            "deliveries": list_pending_deliveries(),
        }
    )


@router.patch("/review/transactions/{transaction_id}/confirm")
def api_confirm_transaction(transaction_id: int):
    if not confirm_transaction(transaction_id):
        raise HTTPException(
            status_code=404,
            detail="Transaction not found or not pending review",
        )
    return {"status": "confirmed", "transaction_id": transaction_id}


@router.patch("/review/transactions/{transaction_id}/reject")
def api_reject_transaction(transaction_id: int):
    if not reject_transaction(transaction_id):
        raise HTTPException(
            status_code=404,
            detail="Transaction not found or not pending review",
        )
    return {"status": "rejected", "transaction_id": transaction_id}


@router.patch("/review/deliveries/{delivery_id}/confirm")
def api_confirm_delivery(delivery_id: int):
    updated_id = confirm_delivery_note(delivery_id)
    if not updated_id:
        raise HTTPException(
            status_code=404,
            detail="Delivery note not found or not pending review",
        )
    return {"status": "confirmed", "delivery_id": updated_id}


@router.patch("/review/deliveries/{delivery_id}/reject")
def api_reject_delivery(delivery_id: int):
    if not reject_delivery_note(delivery_id):
        raise HTTPException(
            status_code=404,
            detail="Delivery note not found or not pending review",
        )
    return {"status": "rejected", "delivery_id": delivery_id}


@router.get("/reports/monthly")
def api_monthly_report(year: Optional[int] = None, month: Optional[int] = None):
    try:
        return serialize_data(get_monthly_report(year=year, month=month))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/employees")
def api_employees():
    employees = _fetch_employees()
    return serialize_data({"items": employees, "count": len(employees)})


@router.get("/invoices")
def api_invoices(limit: int = 100):
    rows = list_invoices(limit=limit)
    return serialize_data({"items": rows, "count": len(rows)})


@router.get("/invoices/{invoice_id}")
def api_invoice_detail(invoice_id: int):
    invoice = get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return serialize_data(invoice)


@router.post("/invoices")
def api_create_invoice(body: InvoiceCreate):
    from datetime import date as date_type

    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one line item is required")

    invoice_date = date_type.today()
    if body.invoice_date:
        try:
            invoice_date = date_type.fromisoformat(body.invoice_date[:10])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid invoice_date") from exc

    due_date = None
    if body.due_date:
        try:
            due_date = date_type.fromisoformat(body.due_date[:10])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid due_date") from exc

    try:
        invoice = create_invoice(
            party_id=body.party_id,
            invoice_date=invoice_date,
            due_date=due_date,
            notes=body.notes,
            linked_receipt_id=body.linked_receipt_id,
            lines=[line.model_dump() for line in body.lines],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return serialize_data(invoice)
