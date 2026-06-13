import json
import os
from contextlib import asynccontextmanager

import psycopg2.extras
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import Optional

from db import (
    DEFAULT_BUSINESS_ID,
    create_tables,
    get_db_connection,
    can_submit_delivery_note,
    get_employee_by_phone,
    message_exists,
    normalize_phone,
)
from delivery_extractor import delivery_status, extract_delivery_note
from models import EmployeeInput, EmployeeUpdate, MessageInput
from parser import parse_message, transaction_status
from whatsapp_client import (
    download_whatsapp_media,
    format_confirmation,
    format_delivery_confirmation,
    format_delivery_unauthorized_reply,
    format_unauthorized_reply,
    send_whatsapp_text,
)

VERIFY_TOKEN = (os.environ.get("VERIFY_TOKEN") or "my_whatsapp_verify_token").strip()
templates = Jinja2Templates(directory="templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(title="WhatsApp Accounting", lifespan=lifespan)


PARSER_VERSION = "v3-delivery-photos"


@app.get("/")
def home():
    return {
        "status": "working",
        "project": "whatsapp-accounting",
        "database": "connected",
        "stage": "1-team-pilot",
        "parser_version": PARSER_VERSION,
        "features": ["text_transactions", "delivery_note_photos"],
        "gemini_configured": bool(os.environ.get("GOOGLE_API_KEY")),
        "gemini_model": os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
    }


@app.post("/message")
async def save_test_message(input_data: MessageInput):
    message_text = input_data.message
    sender = input_data.sender
    employee = get_employee_by_phone(sender)
    parsed = parse_message(message_text)
    status = transaction_status(parsed)

    raw_data = {"sender": sender, "message": message_text}

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages
        (business_id, source, sender, message_text, raw_data)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            DEFAULT_BUSINESS_ID,
            "manual",
            sender,
            message_text,
            json.dumps(raw_data),
        ),
    )
    message_id = cur.fetchone()[0]

    cur.execute(
        """
        INSERT INTO transactions
        (business_id, transaction_type, party, amount, currency, category,
         original_message, sender, employee_id, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            DEFAULT_BUSINESS_ID,
            parsed["type"],
            parsed["party"],
            parsed["amount"],
            parsed["currency"],
            parsed["category"],
            parsed["original_message"],
            sender,
            employee["id"] if employee else None,
            status,
        ),
    )
    transaction_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "saved",
        "message_id": message_id,
        "transaction_id": transaction_id,
        "review_status": status,
        "sender": sender,
        "message": message_text,
        **parsed,
    }


@app.get("/webhook/whatsapp")
def verify_whatsapp_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return int(challenge)

    return {"error": "Verification failed"}


@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    data = await request.json()

    try:
        value = data["entry"][0]["changes"][0]["value"]
        message = value["messages"][0]
        sender = message["from"]
        whatsapp_message_id = message.get("id")
        message_type = message.get("type")
    except (KeyError, IndexError, TypeError):
        return {"status": "ignored"}

    if message_exists(whatsapp_message_id):
        return {"status": "duplicate"}

    employee = get_employee_by_phone(sender)
    if not employee:
        await send_whatsapp_text(sender, format_unauthorized_reply())
        return {"status": "rejected_unregistered_sender", "sender": sender}

    if message_type == "text":
        return await _handle_text_message(
            sender, message["text"]["body"], whatsapp_message_id, employee
        )

    if message_type == "image":
        if not can_submit_delivery_note(employee):
            await send_whatsapp_text(sender, format_delivery_unauthorized_reply())
            return {"status": "rejected_delivery_photo", "sender": sender}
        image = message.get("image", {})
        return await _handle_image_message(
            sender,
            image.get("id"),
            image.get("mime_type", "image/jpeg"),
            image.get("caption"),
            whatsapp_message_id,
            employee,
        )

    return {"status": "ignored", "reason": f"unsupported_type_{message_type}"}


async def _handle_text_message(sender, message_text, whatsapp_message_id, employee):
    parsed = parse_message(message_text)
    status = transaction_status(parsed)
    raw_data = {"from_user": sender, "text": message_text}

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages
        (business_id, source, sender, message_text, raw_data, whatsapp_message_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            DEFAULT_BUSINESS_ID,
            "whatsapp",
            sender,
            message_text,
            json.dumps(raw_data),
            whatsapp_message_id,
        ),
    )
    message_id = cur.fetchone()[0]

    cur.execute(
        """
        INSERT INTO transactions
        (business_id, transaction_type, party, amount, currency, category,
         original_message, sender, employee_id, status, whatsapp_message_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            DEFAULT_BUSINESS_ID,
            parsed["type"],
            parsed["party"],
            parsed["amount"],
            parsed["currency"],
            parsed["category"],
            parsed["original_message"],
            sender,
            employee["id"],
            status,
            whatsapp_message_id,
        ),
    )
    transaction_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    reply = format_confirmation(parsed, employee["name"], status)
    replied = await send_whatsapp_text(sender, reply)

    return {
        "status": "received_and_saved",
        "kind": "transaction",
        "message_id": message_id,
        "transaction_id": transaction_id,
        "review_status": status,
        "whatsapp_reply_sent": replied,
        **parsed,
    }


async def _handle_image_message(
    sender, media_id, mime_type, caption, whatsapp_message_id, employee
):
    if not media_id:
        return {"status": "ignored", "reason": "missing_media_id"}

    try:
        image_bytes, mime_type = await download_whatsapp_media(media_id)
        fields, extraction_raw = await extract_delivery_note(
            image_bytes, mime_type, caption
        )
    except Exception as exc:
        fields = {key: None for key in [
            "document_number", "document_type", "route_note", "client_name",
            "delivery_date", "description", "quantity", "quantity_unit",
            "unit_weight", "total_weight", "truck_number", "driver_name",
            "driver_phone", "driver_id_number", "transporter", "delivered_at",
        ]}
        extraction_raw = {"error": str(exc)}
        status = "pending_review"
    else:
        status = delivery_status(fields)

    message_text = caption or "[delivery note photo]"
    raw_data = {
        "from_user": sender,
        "type": "image",
        "media_id": media_id,
        "caption": caption,
    }

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages
        (business_id, source, sender, message_text, raw_data, whatsapp_message_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            DEFAULT_BUSINESS_ID,
            "whatsapp",
            sender,
            message_text,
            json.dumps(raw_data),
            whatsapp_message_id,
        ),
    )
    message_id = cur.fetchone()[0]

    cur.execute(
        """
        INSERT INTO delivery_notes
        (business_id, employee_id, sender, whatsapp_message_id, whatsapp_media_id,
         document_number, document_type, route_note, client_name, delivery_date,
         description, quantity, quantity_unit, unit_weight, total_weight,
         truck_number, driver_name, driver_phone, driver_id_number,
         transporter, delivered_at, status, extraction_raw)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            DEFAULT_BUSINESS_ID,
            employee["id"],
            sender,
            whatsapp_message_id,
            media_id,
            fields.get("document_number"),
            fields.get("document_type"),
            fields.get("route_note"),
            fields.get("client_name"),
            fields.get("delivery_date"),
            fields.get("description"),
            fields.get("quantity"),
            fields.get("quantity_unit"),
            fields.get("unit_weight"),
            fields.get("total_weight"),
            fields.get("truck_number"),
            fields.get("driver_name"),
            fields.get("driver_phone"),
            fields.get("driver_id_number"),
            fields.get("transporter"),
            fields.get("delivered_at"),
            status,
            json.dumps(extraction_raw),
        ),
    )
    delivery_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    reply = format_delivery_confirmation(
        fields, employee["name"], status, extraction_raw if isinstance(extraction_raw, dict) else None
    )
    replied = await send_whatsapp_text(sender, reply)

    return {
        "status": "received_and_saved",
        "kind": "delivery_note",
        "message_id": message_id,
        "delivery_id": delivery_id,
        "review_status": status,
        "whatsapp_reply_sent": replied,
        **fields,
    }


@app.get("/messages")
def get_messages():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, source, sender, message_text, created_at
        FROM messages
        WHERE business_id = %s
        ORDER BY id DESC;
    """, (DEFAULT_BUSINESS_ID,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row[0],
            "source": row[1],
            "sender": row[2],
            "message": row[3],
            "created_at": str(row[4]),
        }
        for row in rows
    ]


@app.post("/analyze")
async def analyze_message(input_data: MessageInput):
    parsed = parse_message(input_data.message)
    return {**parsed, "review_status": transaction_status(parsed)}


@app.post("/transaction")
async def save_transaction(input_data: MessageInput):
    employee = get_employee_by_phone(input_data.sender)
    parsed = parse_message(input_data.message)
    status = transaction_status(parsed)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO transactions
        (business_id, transaction_type, party, amount, currency, category,
         original_message, sender, employee_id, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, created_at;
        """,
        (
            DEFAULT_BUSINESS_ID,
            parsed["type"],
            parsed["party"],
            parsed["amount"],
            parsed["currency"],
            parsed["category"],
            parsed["original_message"],
            input_data.sender,
            employee["id"] if employee else None,
            status,
        ),
    )

    row = cur.fetchone()
    transaction_id, created_at = row[0], row[1]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "saved",
        "transaction_id": transaction_id,
        "created_at": str(created_at),
        "review_status": status,
        **parsed,
    }


@app.get("/transactions")
def get_transactions(status: Optional[str] = None):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    query = """
        SELECT
            t.id,
            t.transaction_type,
            t.party,
            t.amount,
            t.currency,
            t.category,
            t.original_message,
            t.sender,
            t.status,
            t.created_at,
            e.name AS employee_name
        FROM transactions t
        LEFT JOIN employees e ON e.id = t.employee_id
        WHERE t.business_id = %s
    """
    params: list = [DEFAULT_BUSINESS_ID]

    if status:
        query += " AND t.status = %s"
        params.append(status)

    query += " ORDER BY t.id DESC;"

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row["id"],
            "type": row["transaction_type"],
            "party": row["party"],
            "amount": row["amount"],
            "currency": row["currency"],
            "category": row["category"],
            "original_message": row["original_message"],
            "sender": row["sender"],
            "employee_name": row["employee_name"],
            "status": row["status"],
            "created_at": str(row["created_at"]),
        }
        for row in rows
    ]


@app.get("/expenses")
def get_expenses():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, party, amount, currency, original_message, sender, status, created_at
        FROM transactions
        WHERE business_id = %s AND transaction_type = 'expense'
        ORDER BY id DESC;
    """, (DEFAULT_BUSINESS_ID,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row[0],
            "party": row[1],
            "amount": row[2],
            "currency": row[3],
            "original_message": row[4],
            "sender": row[5],
            "status": row[6],
            "created_at": str(row[7]),
        }
        for row in rows
    ]


@app.get("/receipts")
def get_receipts():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, party, amount, currency, original_message, sender, status, created_at
        FROM transactions
        WHERE business_id = %s AND transaction_type = 'receipt'
        ORDER BY id DESC;
    """, (DEFAULT_BUSINESS_ID,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row[0],
            "party": row[1],
            "amount": row[2],
            "currency": row[3],
            "original_message": row[4],
            "sender": row[5],
            "status": row[6],
            "created_at": str(row[7]),
        }
        for row in rows
    ]


@app.get("/party/{party_name}")
def get_transactions_by_party(party_name: str):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id, transaction_type, party, amount, currency,
            original_message, sender, status, created_at
        FROM transactions
        WHERE business_id = %s
          AND LOWER(TRIM(party)) = LOWER(TRIM(%s))
        ORDER BY id DESC;
    """, (DEFAULT_BUSINESS_ID, party_name))

    rows = cur.fetchall()

    transactions = [
        {
            "id": row[0],
            "type": row[1],
            "party": row[2],
            "amount": row[3],
            "currency": row[4],
            "original_message": row[5],
            "sender": row[6],
            "status": row[7],
            "created_at": str(row[8]),
        }
        for row in rows
    ]

    total_received = sum(
        row[3] for row in rows if row[1] == "receipt" and row[3] is not None
    )
    total_paid = sum(
        row[3]
        for row in rows
        if row[1] in ["expense", "payment", "return_payment"] and row[3] is not None
    )

    cur.close()
    conn.close()

    return {
        "party": party_name,
        "total_received": total_received,
        "total_paid": total_paid,
        "balance": total_received - total_paid,
        "transactions": transactions,
    }


@app.get("/summary")
def get_summary():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'receipt' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'payment' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'return_payment' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END), 0)
        FROM transactions
        WHERE business_id = %s;
    """, (DEFAULT_BUSINESS_ID,))

    row = cur.fetchone()
    cur.close()
    conn.close()

    total_receipts, total_expenses, total_payments, total_returns, pending_review = row

    return {
        "total_receipts": total_receipts,
        "total_expenses": total_expenses,
        "total_payments": total_payments,
        "total_returns": total_returns,
        "pending_review": pending_review,
        "net_balance": total_receipts - total_expenses - total_payments - total_returns,
    }


@app.post("/employees")
def create_employee(input_data: EmployeeInput):
    phone = normalize_phone(input_data.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            INSERT INTO employees (business_id, phone, name, role)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (business_id, phone) DO UPDATE SET
                name = EXCLUDED.name,
                role = COALESCE(EXCLUDED.role, employees.role)
            RETURNING id, phone, name, role, created_at;
            """,
            (DEFAULT_BUSINESS_ID, phone, input_data.name, input_data.role),
        )
        row = cur.fetchone()
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to save employee") from exc
    finally:
        cur.close()
        conn.close()

    return {
        "id": row[0],
        "phone": row[1],
        "name": row[2],
        "role": row[3],
        "created_at": str(row[4]),
    }


@app.get("/employees")
def list_employees():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, phone, name, role, is_active, created_at
        FROM employees
        WHERE business_id = %s
        ORDER BY name ASC;
    """, (DEFAULT_BUSINESS_ID,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row[0],
            "phone": row[1],
            "name": row[2],
            "role": row[3],
            "is_active": row[4],
            "created_at": str(row[5]),
        }
        for row in rows
    ]


@app.patch("/employees/{employee_id}")
def update_employee(employee_id: int, input_data: EmployeeUpdate):
    if input_data.name is None and input_data.role is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT id FROM employees WHERE id = %s AND business_id = %s;",
        (employee_id, DEFAULT_BUSINESS_ID),
    )
    if not cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found")

    fields = []
    values = []
    if input_data.name is not None:
        fields.append("name = %s")
        values.append(input_data.name)
    if input_data.role is not None:
        fields.append("role = %s")
        values.append(input_data.role)

    values.extend([employee_id, DEFAULT_BUSINESS_ID])
    cur.execute(
        f"""
        UPDATE employees
        SET {", ".join(fields)}
        WHERE id = %s AND business_id = %s
        RETURNING id, phone, name, role, is_active, created_at;
        """,
        values,
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return {
        "id": row[0],
        "phone": row[1],
        "name": row[2],
        "role": row[3],
        "is_active": row[4],
        "created_at": str(row[5]),
    }


@app.patch("/transactions/{transaction_id}/confirm")
def confirm_transaction(transaction_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE transactions
        SET status = 'confirmed'
        WHERE id = %s AND business_id = %s
        RETURNING id;
        """,
        (transaction_id, DEFAULT_BUSINESS_ID),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {"status": "confirmed", "transaction_id": transaction_id}


@app.get("/delivery-notes")
def list_delivery_notes():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            d.id, d.document_number, d.document_type, d.route_note,
            d.client_name, d.delivery_date, d.description, d.quantity,
            d.quantity_unit, d.unit_weight, d.total_weight, d.truck_number,
            d.driver_name, d.driver_phone, d.driver_id_number, d.transporter,
            d.delivered_at, d.status, d.extraction_raw, d.created_at,
            e.name AS employee_name
        FROM delivery_notes d
        LEFT JOIN employees e ON e.id = d.employee_id
        WHERE d.business_id = %s
        ORDER BY d.id DESC;
        """,
        (DEFAULT_BUSINESS_ID,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row["id"],
            "document_number": row["document_number"],
            "document_type": row["document_type"],
            "route_note": row["route_note"],
            "client_name": row["client_name"],
            "delivery_date": row["delivery_date"],
            "description": row["description"],
            "quantity": row["quantity"],
            "quantity_unit": row["quantity_unit"],
            "unit_weight": row["unit_weight"],
            "total_weight": row["total_weight"],
            "truck_number": row["truck_number"],
            "driver_name": row["driver_name"],
            "driver_phone": row["driver_phone"],
            "driver_id_number": row["driver_id_number"],
            "transporter": row["transporter"],
            "delivered_at": row["delivered_at"],
            "status": row["status"],
            "employee_name": row["employee_name"],
            "extraction_error": (row["extraction_raw"] or {}).get("error"),
            "field_labels": (row["extraction_raw"] or {}).get("field_labels") or {},
            "blank_on_form": (row["extraction_raw"] or {}).get("blank_on_form") or [],
            "blank_field_labels": (row["extraction_raw"] or {}).get("blank_field_labels") or [],
            "created_at": str(row["created_at"]),
        }
        for row in rows
    ]


@app.get("/deliveries", response_class=HTMLResponse)
def deliveries_dashboard(request: Request):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END), 0) AS pending_review
        FROM delivery_notes
        WHERE business_id = %s;
        """,
        (DEFAULT_BUSINESS_ID,),
    )
    summary = cur.fetchone()

    cur.execute(
        """
        SELECT
            d.id, d.document_number, d.client_name, d.delivery_date,
            d.description, d.quantity, d.quantity_unit, d.total_weight,
            d.truck_number, d.driver_name, d.route_note, d.status,
            d.extraction_raw, d.created_at, e.name AS employee_name
        FROM delivery_notes d
        LEFT JOIN employees e ON e.id = d.employee_id
        WHERE d.business_id = %s
        ORDER BY d.id DESC
        LIMIT 100;
        """,
        (DEFAULT_BUSINESS_ID,),
    )
    deliveries = cur.fetchall()
    cur.close()
    conn.close()

    for row in deliveries:
        raw = row.get("extraction_raw") or {}
        row["extraction_error"] = raw.get("error")
        row["field_labels"] = raw.get("field_labels") or {}
        row["blank_on_form"] = raw.get("blank_on_form") or []
        row["blank_field_labels"] = raw.get("blank_field_labels") or []

    return templates.TemplateResponse(
        request,
        "deliveries.html",
        {
            "summary": summary,
            "deliveries": deliveries,
            "gemini_configured": bool(os.environ.get("GOOGLE_API_KEY")),
        },
    )


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, employee_id: Optional[int] = None):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'receipt' THEN amount ELSE 0 END), 0) AS total_receipts,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
            COALESCE(SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END), 0) AS pending_review
        FROM transactions
        WHERE business_id = %s;
    """, (DEFAULT_BUSINESS_ID,))
    summary = cur.fetchone()

    cur.execute("""
        SELECT id, name, role, phone
        FROM employees
        WHERE business_id = %s AND is_active = TRUE
        ORDER BY name ASC;
    """, (DEFAULT_BUSINESS_ID,))
    employees = cur.fetchall()

    query = """
        SELECT
            t.id, t.transaction_type, t.party, t.amount, t.currency,
            t.category, t.original_message, t.status, t.created_at,
            e.name AS employee_name
        FROM transactions t
        LEFT JOIN employees e ON e.id = t.employee_id
        WHERE t.business_id = %s
    """
    params: list = [DEFAULT_BUSINESS_ID]
    if employee_id:
        query += " AND t.employee_id = %s"
        params.append(employee_id)
    query += " ORDER BY t.id DESC LIMIT 100;"

    cur.execute(query, params)
    transactions = cur.fetchall()

    cur.close()
    conn.close()

    net_balance = summary["total_receipts"] - summary["total_expenses"]

    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "summary": summary,
            "net_balance": net_balance,
            "employees": employees,
            "transactions": transactions,
            "selected_employee_id": employee_id,
        },
    )
