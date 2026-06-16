import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from api_v1 import router as api_v1_router

from auth import (
    SESSION_SECRET,
    auth_enabled,
    is_authenticated,
    require_dashboard_auth,
    verify_password,
)
from whatsapp_access import staff_pin_enabled

from db import (
    DEFAULT_BUSINESS_ID,
    create_tables,
    get_db_connection,
    can_submit_delivery_note,
    get_employee_by_phone,
    message_exists,
    normalize_phone,
    run_startup_backfills,
    try_claim_whatsapp_message,
)
from categories import get_category_summary, list_categories
from products import (
    get_weekly_deliveries_by_client,
    list_products,
    prepare_delivery_product_fields,
    update_product_price,
)
from delivery_extractor import delivery_status, extract_delivery_note
from deliveries import find_existing_delivery_by_document, normalize_document_number
from models import EmployeeInput, EmployeeUpdate, MessageInput, ProductUpdate
from parties import (
    format_party_balance_line,
    get_party_detail,
    insert_transaction,
    list_parties_with_balances,
    resolve_party_for_delivery,
    resolve_party_for_transaction,
)
from parser import parse_message, transaction_status
from review import (
    confirm_delivery_note,
    confirm_transaction as confirm_pending_transaction,
    get_review_counts,
    list_pending_deliveries,
    list_pending_transactions,
    reject_delivery_note,
    reject_transaction,
)
from reports import get_monthly_report
from whatsapp_client import (
    check_whatsapp_token,
    download_whatsapp_media,
    format_confirmation,
    format_delivery_confirmation,
    format_delivery_received_ack,
    format_delivery_unauthorized_reply,
    format_duplicate_delivery_reply,
    format_unauthorized_reply,
    format_unsupported_message_reply,
    send_whatsapp_text,
)
from whatsapp_gate import AccessDecision, handle_whatsapp_access

logger = logging.getLogger("uvicorn.error")

VERIFY_TOKEN = (os.environ.get("VERIFY_TOKEN") or "my_whatsapp_verify_token").strip()
templates = Jinja2Templates(directory="templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    backfill_task = asyncio.create_task(asyncio.to_thread(run_startup_backfills))
    yield
    backfill_task.cancel()


app = FastAPI(title="WhatsApp Accounting", lifespan=lifespan)


@app.middleware("http")
async def dashboard_auth_middleware(request: Request, call_next):
    return await require_dashboard_auth(request, call_next)


# SessionMiddleware must wrap auth so request.session exists in require_dashboard_auth.
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax")

_cors_origins = [
    origin.strip()
    for origin in (os.environ.get("CORS_ORIGINS") or "").split(",")
    if origin.strip()
]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_v1_router)

PARSER_VERSION = "v3-delivery-photos"


@app.get("/")
async def home():
    wa = await check_whatsapp_token()
    return {
        "status": "working",
        "project": "whatsapp-accounting",
        "database": "connected",
        "stage": "1-team-pilot",
        "parser_version": PARSER_VERSION,
        "features": [
            "text_transactions",
            "delivery_note_photos",
            "party_ledger",
            "categories",
            "delivery_products",
            "review_queue",
            "monthly_reports",
            "dashboard_login",
            "api_v1",
            "whatsapp_staff_pin",
        ],
        "gemini_configured": bool(os.environ.get("GOOGLE_API_KEY")),
        "gemini_model": os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
        "whatsapp_configured": wa.get("configured"),
        "whatsapp_token_valid": wa.get("token_valid"),
        "dashboard_auth_enabled": auth_enabled(),
        "whatsapp_staff_pin_enabled": staff_pin_enabled(),
    }


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, next: str = "/dashboard"):
    if is_authenticated(request):
        return RedirectResponse(next if next.startswith("/") else "/dashboard", status_code=302)
    return templates.TemplateResponse(
        request,
        "login.html",
        {"next_path": next, "error": None},
    )


@app.post("/login", response_class=HTMLResponse)
async def login_submit(
    request: Request,
    password: str = Form(...),
    next: str = Form("/dashboard"),
):
    safe_next = next if next.startswith("/") and not next.startswith("//") else "/dashboard"
    if verify_password(password):
        request.session["authenticated"] = True
        return RedirectResponse(safe_next, status_code=302)
    return templates.TemplateResponse(
        request,
        "login.html",
        {"next_path": safe_next, "error": "Wrong password. Try again."},
        status_code=401,
    )


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=302)


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

    transaction_id, party_id = insert_transaction(
        cur,
        parsed,
        sender,
        employee["id"] if employee else None,
        status,
    )

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
    payload = _parse_incoming_whatsapp_message(data)
    if not payload:
        return {"status": "ignored"}

    whatsapp_message_id = payload["whatsapp_message_id"]
    if message_exists(whatsapp_message_id):
        return {"status": "duplicate"}

    employee = get_employee_by_phone(payload["sender"])
    if not employee:
        asyncio.create_task(
            send_whatsapp_text(payload["sender"], format_unauthorized_reply())
        )
        return {"status": "rejected_unregistered_sender"}

    media = _extract_delivery_media(payload["message"])
    message = payload["message"]
    message_type = payload["message_type"]
    text_body = None
    if message_type == "text":
        text_body = message.get("text", {}).get("body")

    if media:
        if not try_claim_whatsapp_message(
            whatsapp_message_id,
            payload["sender"],
            "[delivery note photo - processing]",
            {"status": "processing", "type": message_type},
        ):
            return {"status": "duplicate"}

        access = await handle_whatsapp_access(
            payload["sender"],
            employee,
            message_type=message_type,
            message=message,
            text_body=text_body,
            is_media=True,
        )
        if not access.proceed:
            return access.status or {"status": "access_denied"}

        if not can_submit_delivery_note(employee):
            asyncio.create_task(
                send_whatsapp_text(
                    payload["sender"], format_delivery_unauthorized_reply()
                )
            )
            return {"status": "rejected_delivery_photo", "sender": payload["sender"]}

        await send_whatsapp_text(payload["sender"], format_delivery_received_ack())
        asyncio.create_task(
            _process_whatsapp_payload(payload, media, access=access)
        )
        return {"status": "accepted"}

    return await _process_whatsapp_payload(payload, None)


def _parse_incoming_whatsapp_message(data: dict) -> Optional[dict[str, Any]]:
    try:
        value = data["entry"][0]["changes"][0]["value"]
        if "messages" not in value:
            return None
        message = value["messages"][0]
        return {
            "sender": message["from"],
            "whatsapp_message_id": message.get("id"),
            "message_type": message.get("type"),
            "message": message,
        }
    except (KeyError, IndexError, TypeError):
        return None


def _extract_delivery_media(message: dict) -> Optional[tuple[str, str, Optional[str]]]:
    message_type = message.get("type")
    if message_type == "image":
        image = message.get("image", {})
        media_id = image.get("id")
        if media_id:
            return media_id, image.get("mime_type", "image/jpeg"), image.get("caption")
    if message_type == "document":
        doc = message.get("document", {})
        mime = (doc.get("mime_type") or "").lower()
        if mime.startswith("image/") and doc.get("id"):
            return doc.get("id"), mime, doc.get("caption")
    return None


async def _process_whatsapp_payload(
    payload: dict[str, Any],
    media: Optional[tuple[str, str, Optional[str]]],
    access: Optional[AccessDecision] = None,
):
    sender = payload["sender"]
    whatsapp_message_id = payload["whatsapp_message_id"]
    message_type = payload["message_type"]
    message = payload["message"]

    try:
        if message_exists(whatsapp_message_id) and not media:
            return {"status": "duplicate"}

        employee = get_employee_by_phone(sender)
        if not employee:
            await send_whatsapp_text(sender, format_unauthorized_reply())
            return {"status": "rejected_unregistered_sender", "sender": sender}

        text_body = None
        if message_type == "text":
            text_body = message.get("text", {}).get("body")

        if access is None:
            access = await handle_whatsapp_access(
                sender,
                employee,
                message_type=message_type,
                message=message,
                text_body=text_body,
                is_media=bool(media),
            )
        if not access.proceed:
            return access.status or {"status": "access_denied", "sender": sender}

        if media:
            if not can_submit_delivery_note(employee):
                await send_whatsapp_text(sender, format_delivery_unauthorized_reply())
                return {"status": "rejected_delivery_photo", "sender": sender}
            media_id, mime_type, caption = media
            return await _handle_image_message(
                sender, media_id, mime_type, caption, whatsapp_message_id, employee,
                message_type=message_type,
            )

        if message_type == "text":
            return await _handle_text_message(
                sender, message["text"]["body"], whatsapp_message_id, employee
            )

        if message_type == "interactive":
            return access.status or {"status": "interactive_handled", "sender": sender}

        await send_whatsapp_text(
            sender,
            format_unsupported_message_reply(message_type or "unknown"),
        )
        return {"status": "ignored", "reason": f"unsupported_type_{message_type}"}
    except Exception:
        logger.exception("WhatsApp message processing failed: %s", whatsapp_message_id)
        if employee := get_employee_by_phone(sender):
            await send_whatsapp_text(
                sender,
                "⚠️ Something went wrong saving your message. Please try again in a minute.",
            )
        return {"status": "error"}


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

    transaction_id, party_id = insert_transaction(
        cur,
        parsed,
        sender,
        employee["id"],
        status,
        whatsapp_message_id=whatsapp_message_id,
    )
    conn.commit()
    cur.close()
    conn.close()

    party_balance = format_party_balance_line(party_id) if party_id else None
    reply = format_confirmation(parsed, employee["name"], status, party_balance)
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
    sender, media_id, mime_type, caption, whatsapp_message_id, employee,
    message_type: str = "image",
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

    doc_normalized = normalize_document_number(fields.get("document_number"))
    existing_delivery = find_existing_delivery_by_document(fields.get("document_number"))

    message_text = caption or "[delivery note photo]"
    raw_data = {
        "from_user": sender,
        "type": message_type,
        "media_id": media_id,
        "caption": caption,
    }

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE messages
        SET message_text = %s, raw_data = %s
        WHERE whatsapp_message_id = %s
        RETURNING id;
        """,
        (
            message_text,
            json.dumps(raw_data),
            whatsapp_message_id,
        ),
    )
    row = cur.fetchone()
    if row:
        message_id = row[0]
    else:
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

    if existing_delivery:
        conn.commit()
        cur.close()
        conn.close()
        reply = format_duplicate_delivery_reply(existing_delivery, employee["name"])
        replied = await send_whatsapp_text(sender, reply)
        return {
            "status": "duplicate_delivery",
            "kind": "delivery_note",
            "message_id": message_id,
            "existing_delivery_id": existing_delivery["id"],
            "document_number": fields.get("document_number"),
            "whatsapp_reply_sent": replied,
        }

    party_id = resolve_party_for_delivery(cur, fields.get("client_name"))
    product_meta = prepare_delivery_product_fields(cur, fields)

    try:
        cur.execute(
            """
            INSERT INTO delivery_notes
            (business_id, employee_id, party_id, product_id, sender, whatsapp_message_id, whatsapp_media_id,
             document_number, document_number_normalized, document_type, route_note, client_name, delivery_date,
             description, quantity, quantity_unit, unit_weight, total_weight,
             unit_price_fcfa, line_total_fcfa,
             truck_number, driver_name, driver_phone, driver_id_number,
             transporter, delivered_at, status, extraction_raw)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                DEFAULT_BUSINESS_ID,
                employee["id"],
                party_id,
                product_meta["product_id"],
                sender,
                whatsapp_message_id,
                media_id,
                fields.get("document_number"),
                doc_normalized,
                fields.get("document_type"),
                fields.get("route_note"),
                fields.get("client_name"),
                fields.get("delivery_date"),
                fields.get("description"),
                fields.get("quantity"),
                fields.get("quantity_unit"),
                fields.get("unit_weight"),
                fields.get("total_weight"),
                product_meta["unit_price_fcfa"],
                product_meta["line_total_fcfa"],
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
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        existing_delivery = find_existing_delivery_by_document(fields.get("document_number"))
        if not existing_delivery:
            raise
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE messages
            SET message_text = %s, raw_data = %s
            WHERE whatsapp_message_id = %s
            RETURNING id;
            """,
            (
                message_text,
                json.dumps({**raw_data, "duplicate_of_delivery_id": existing_delivery["id"]}),
                whatsapp_message_id,
            ),
        )
        row = cur.fetchone()
        message_id = row[0] if row else None
        conn.commit()
        cur.close()
        conn.close()
        reply = format_duplicate_delivery_reply(existing_delivery, employee["name"])
        replied = await send_whatsapp_text(sender, reply)
        return {
            "status": "duplicate_delivery",
            "kind": "delivery_note",
            "message_id": message_id,
            "existing_delivery_id": existing_delivery["id"],
            "document_number": fields.get("document_number"),
            "whatsapp_reply_sent": replied,
        }

    conn.commit()
    cur.close()
    conn.close()

    fields["line_total_fcfa"] = product_meta["line_total_fcfa"]
    fields["unit_price_fcfa"] = product_meta["unit_price_fcfa"]

    reply = format_delivery_confirmation(
        fields, employee["name"], status, extraction_raw if isinstance(extraction_raw, dict) else None
    )
    if party_id and status == "confirmed":
        balance_line = format_party_balance_line(party_id)
        if balance_line:
            reply += f"\n\n{balance_line}"
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

    transaction_id, party_id = insert_transaction(
        cur,
        parsed,
        input_data.sender,
        employee["id"] if employee else None,
        status,
    )
    cur.execute("SELECT created_at FROM transactions WHERE id = %s;", (transaction_id,))
    created_at = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "saved",
        "transaction_id": transaction_id,
        "party_id": party_id,
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
    if not confirm_pending_transaction(transaction_id):
        raise HTTPException(
            status_code=404,
            detail="Transaction not found or not pending review",
        )
    return {"status": "confirmed", "transaction_id": transaction_id}


@app.patch("/transactions/{transaction_id}/reject")
def reject_transaction_endpoint(transaction_id: int):
    if not reject_transaction(transaction_id):
        raise HTTPException(
            status_code=404,
            detail="Transaction not found or not pending review",
        )
    return {"status": "rejected", "transaction_id": transaction_id}


@app.patch("/delivery-notes/{delivery_id}/confirm")
def confirm_delivery_endpoint(delivery_id: int):
    updated_id = confirm_delivery_note(delivery_id)
    if not updated_id:
        raise HTTPException(
            status_code=404,
            detail="Delivery note not found or not pending review",
        )
    return {"status": "confirmed", "delivery_id": updated_id}


@app.patch("/delivery-notes/{delivery_id}/reject")
def reject_delivery_endpoint(delivery_id: int):
    if not reject_delivery_note(delivery_id):
        raise HTTPException(
            status_code=404,
            detail="Delivery note not found or not pending review",
        )
    return {"status": "rejected", "delivery_id": delivery_id}


@app.get("/review", response_class=HTMLResponse)
def review_dashboard(request: Request):
    counts = get_review_counts()
    transactions = list_pending_transactions()
    deliveries = list_pending_deliveries()
    return templates.TemplateResponse(
        request,
        "review.html",
        {
            "counts": counts,
            "transactions": transactions,
            "deliveries": deliveries,
        },
    )


@app.get("/review-count")
def review_count_api():
    return get_review_counts()


@app.get("/reports", response_class=HTMLResponse)
def reports_dashboard(request: Request, year: Optional[int] = None, month: Optional[int] = None):
    try:
        report = get_monthly_report(year=year, month=month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    current_year = date.today().year
    year_options = list(range(current_year - 2, current_year + 1))
    return templates.TemplateResponse(
        request,
        "reports.html",
        {
            "report": report,
            "year_options": year_options,
        },
    )


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
            d.truck_number, d.driver_name, d.driver_phone, d.route_note, d.status,
            d.party_id, d.line_total_fcfa, d.unit_price_fcfa,
            pr.name AS product_name,
            d.extraction_raw, d.created_at, e.name AS employee_name
        FROM delivery_notes d
        LEFT JOIN employees e ON e.id = d.employee_id
        LEFT JOIN products pr ON pr.id = d.product_id
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

    weekly_deliveries = get_weekly_deliveries_by_client()
    review_counts = get_review_counts()

    return templates.TemplateResponse(
        request,
        "deliveries.html",
        {
            "summary": summary,
            "deliveries": deliveries,
            "weekly_deliveries": weekly_deliveries,
            "gemini_configured": bool(os.environ.get("GOOGLE_API_KEY")),
            "review_counts": review_counts,
        },
    )


@app.get("/products", response_class=HTMLResponse)
def products_dashboard(request: Request):
    products = list_products()
    return templates.TemplateResponse(
        request,
        "products.html",
        {"products": products},
    )


@app.get("/products-list")
def products_api():
    return list_products()


@app.patch("/products/{product_id}")
def patch_product(product_id: int, data: ProductUpdate):
    if data.default_unit_price_fcfa is None:
        raise HTTPException(status_code=400, detail="default_unit_price_fcfa is required")
    if data.default_unit_price_fcfa < 0:
        raise HTTPException(status_code=400, detail="Price must be zero or positive")
    product = update_product_price(product_id, data.default_unit_price_fcfa)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.get("/deliveries/weekly-by-client")
def weekly_deliveries_api():
    return get_weekly_deliveries_by_client()


@app.get("/categories", response_class=HTMLResponse)
def categories_dashboard(request: Request, period: str = "month"):
    if period not in ("month", "all"):
        period = "month"
    summary = get_category_summary(period=period)
    categories = list_categories()
    return templates.TemplateResponse(
        request,
        "categories.html",
        {"summary": summary, "categories": categories},
    )


@app.get("/categories-list")
def categories_api():
    return list_categories()


@app.get("/categories/summary")
def categories_summary_api(period: str = "month"):
    if period not in ("month", "all"):
        period = "month"
    return get_category_summary(period=period)


@app.get("/parties", response_class=HTMLResponse)
def parties_dashboard(request: Request):
    parties = list_parties_with_balances()
    summary = {
        "total_parties": len(parties),
        "with_deliveries": sum(1 for p in parties if p["delivery_count"] > 0),
        "with_transactions": sum(1 for p in parties if p["transaction_count"] > 0),
    }
    return templates.TemplateResponse(
        request,
        "parties.html",
        {"parties": parties, "summary": summary},
    )


@app.get("/parties/{party_id}", response_class=HTMLResponse)
def party_detail_page(request: Request, party_id: int):
    party = get_party_detail(party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return templates.TemplateResponse(
        request,
        "party_detail.html",
        {"party": party},
    )


@app.get("/parties-list")
def list_parties_api():
    return list_parties_with_balances()


@app.get("/parties/{party_id}/detail")
def get_party_api(party_id: int):
    party = get_party_detail(party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return {
        **party,
        "created_at": str(party["created_at"]) if party.get("created_at") else None,
        "transactions": [
            {**t, "created_at": str(t["created_at"])} for t in party["transactions"]
        ],
        "deliveries": [
            {**d, "created_at": str(d["created_at"])} for d in party["deliveries"]
        ],
    }


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
            t.id, t.transaction_type, t.party, t.party_id, t.amount, t.currency,
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
    category_summary = get_category_summary(period="month")
    review_counts = get_review_counts()

    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "summary": summary,
            "net_balance": net_balance,
            "employees": employees,
            "transactions": transactions,
            "selected_employee_id": employee_id,
            "category_summary": category_summary,
            "review_counts": review_counts,
        },
    )
