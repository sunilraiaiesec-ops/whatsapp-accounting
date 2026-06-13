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
    get_employee_by_phone,
    message_exists,
    normalize_phone,
)
from models import EmployeeInput, EmployeeUpdate, MessageInput
from parser import parse_message, transaction_status
from whatsapp_client import (
    format_confirmation,
    format_unauthorized_reply,
    send_whatsapp_text,
)

VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN", "my_whatsapp_verify_token")
templates = Jinja2Templates(directory="templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(title="WhatsApp Accounting", lifespan=lifespan)


@app.get("/")
def home():
    return {
        "status": "working",
        "project": "whatsapp-accounting",
        "database": "connected",
        "stage": "1-team-pilot",
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
        message_text = message["text"]["body"]
        whatsapp_message_id = message.get("id")
    except (KeyError, IndexError, TypeError):
        return {"status": "ignored"}

    if message_exists(whatsapp_message_id):
        return {"status": "duplicate"}

    employee = get_employee_by_phone(sender)
    if not employee:
        await send_whatsapp_text(sender, format_unauthorized_reply())
        return {"status": "rejected_unregistered_sender", "sender": sender}

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

    employee_name = employee["name"]
    reply = format_confirmation(parsed, employee_name, status)
    replied = await send_whatsapp_text(sender, reply)

    return {
        "status": "received_and_saved",
        "message_id": message_id,
        "transaction_id": transaction_id,
        "review_status": status,
        "whatsapp_reply_sent": replied,
        **parsed,
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
