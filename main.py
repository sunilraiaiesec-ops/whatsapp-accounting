import os
import json
import psycopg2
from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI()

DATABASE_URL = os.environ.get("DATABASE_URL")


class MessageInput(BaseModel):
    sender: str
    message: str
    

class WhatsAppInput(BaseModel):
    from_user: str
    text: str


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def create_tables():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            source TEXT,
            sender TEXT,
            message_text TEXT,
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            transaction_type TEXT,
            party TEXT,
            amount INTEGER,
            currency TEXT,
            category TEXT,
            original_message TEXT,
            sender TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("""
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS category TEXT;
""")

    
    conn.commit()
    cur.close()
    conn.close()


@app.on_event("startup")
def startup():
    create_tables()


@app.get("/")
def home():
    return {
        "status": "working",
        "project": "whatsapp-accounting",
        "database": "connected"
    }


@app.post("/message")
async def save_test_message(input_data: MessageInput):

    message_text = input_data.message
    sender = input_data.sender

    raw_data = {
        "sender": sender,
        "message": message_text
    }

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages
        (source, sender, message_text, raw_data)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (
            "manual",
            sender,
            message_text,
            json.dumps(raw_data)
        )
    )

    message_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "saved",
        "message_id": message_id,
        "sender": sender,
        "message": message_text
    }


@app.post("/webhook/whatsapp")
async def whatsapp_webhook(data: WhatsAppInput):

    raw_data = {
        "from_user": data.from_user,
        "text": data.text
    }

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages
        (source, sender, message_text, raw_data)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (
            "whatsapp",
            data.from_user,
            data.text,
            json.dumps(raw_data)
        )
    )

    message_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "received",
        "message_id": message_id,
        "sender": data.from_user,
        "message": data.text
    }


@app.get("/messages")
def get_messages():

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id,
            source,
            sender,
            message_text,
            created_at
        FROM messages
        ORDER BY id DESC;
    """)

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return [
        {
            "id": row[0],
            "source": row[1],
            "sender": row[2],
            "message": row[3],
            "created_at": str(row[4])
        }
        for row in rows
    ]


import re

def parse_message(message: str) -> dict:
    message = message.strip()
    lower_message = message.lower()

    amount_match = re.search(r"(\d[\d,]*)", message)
    amount = None
    if amount_match:
        amount = int(amount_match.group(1).replace(",", ""))

    currency = "FCFA" if "fcfa" in lower_message or "cfa" in lower_message else None

    transaction_type = "unknown"
    party = None
    category = None

    # Receipt patterns
    if "received from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(r"received from\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif lower_message.startswith("received") and "from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(r"from\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif re.search(r"\bse\b", lower_message) and (
        re.search(r"\bliye\b", lower_message)
        or re.search(r"\bliya\b", lower_message)
        or re.search(r"\blia\b", lower_message)
        or re.search(r"\bli\b", lower_message)
        or re.search(r"\bmila\b", lower_message)
        or re.search(r"\bmile\b", lower_message)
        or re.search(r"\breceived\b", lower_message)
    ):
        transaction_type = "receipt"
        party_match = re.search(r"^([A-Za-z\s]+?)\s+se\b", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip().title()# Expense patterns
    elif "paid" in lower_message:
        transaction_type = "expense"
        party_match = re.search(r"paid\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    

    elif re.search(r"\bko\b", lower_message) and (
        re.search(r"\bdiye\b", lower_message)
        or re.search(r"\bdiya\b", lower_message)
        or re.search(r"\bdia\b", lower_message)
        or re.search(r"\bdi\b", lower_message)
        or re.search(r"\bde diye\b", lower_message)
    ):
        
        transaction_type = "expense"
        party_match = re.search(r"^([A-Za-z\s]+?)\s+ko\b", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip().title()

    
    elif "sent" in lower_message:
        transaction_type = "expense"
        party_match = re.search(r"sent\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "gave" in lower_message:
        transaction_type = "expense"
        party_match = re.search(r"gave\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "give to" in lower_message:
        transaction_type = "payment"
        party_match = re.search(r"give to\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "return to" in lower_message:
        transaction_type = "return_payment"
        party_match = re.search(r"return to\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    # Category detection
    if "transport" in lower_message:
        category = "transport"
    elif "rent" in lower_message:
        category = "rent"
    elif "salary" in lower_message:
        category = "salary"
    elif "rice" in lower_message:
        category = "rice"
    elif "loading" in lower_message:
        category = "loading"

    return {
        "original_message": message,
        "type": transaction_type,
        "party": party,
        "amount": amount,
        "currency": currency,
        "category": category,
    }

@app.post("/analyze")
async def analyze_message(input_data: MessageInput):
    return parse_message(input_data.message)


@app.post("/transaction")
async def save_transaction(input_data: MessageInput):
    parsed = parse_message(input_data.message)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO transactions
        (transaction_type, party, amount, currency, original_message, sender)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, created_at;
        """,
        (
            parsed["type"],
            parsed["party"],
            parsed["amount"],
            parsed["currency"],
            parsed["original_message"],
            input_data.sender,
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
        **parsed,
    }


@app.get("/transactions")
def get_transactions():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id,
            transaction_type,
            party,
            amount,
            currency,
            original_message,
            sender,
            created_at
        FROM transactions
        ORDER BY id DESC;
    """)

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": row[0],
            "type": row[1],
            "party": row[2],
            "amount": row[3],
            "currency": row[4],
            "original_message": row[5],
            "sender": row[6],
            "created_at": str(row[7]),
        }
        for row in rows
    ]


@app.get("/expenses")
def get_expenses():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, party, amount, currency, original_message, sender, created_at
        FROM transactions
        WHERE transaction_type = 'expense'
        ORDER BY id DESC;
    """)

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
            "created_at": str(row[6])
        }
        for row in rows
    ]


@app.get("/receipts")
def get_receipts():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, party, amount, currency, original_message, sender, created_at
        FROM transactions
        WHERE transaction_type = 'receipt'
        ORDER BY id DESC;
    """)

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
            "created_at": str(row[6])
        }
        for row in rows
    ]


@app.get("/party/{party_name}")
def get_transactions_by_party(party_name: str):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id,
            transaction_type,
            party,
            amount,
            currency,
            original_message,
            sender,
            created_at
        FROM transactions
        WHERE LOWER(TRIM(party)) = LOWER(TRIM(%s))
        ORDER BY id DESC;
    """, (party_name,))

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
            "created_at": str(row[7])
        }
        for row in rows
    ]

    total_received = sum(
        row[3] for row in rows
        if row[1] == "receipt" and row[3] is not None
    )

    total_paid = sum(
        row[3] for row in rows
        if row[1] in ["expense", "payment", "return_payment"]
        and row[3] is not None
    )

    balance = total_received - total_paid

    cur.close()
    conn.close()

    return {
        "party": party_name,
        "total_received": total_received,
        "total_paid": total_paid,
        "balance": balance,
        "transactions": transactions
    }

@app.get("/summary")
def get_summary():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'receipt' THEN amount ELSE 0 END), 0) AS total_receipts,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
            COALESCE(SUM(CASE WHEN transaction_type = 'payment' THEN amount ELSE 0 END), 0) AS total_payments,
            COALESCE(SUM(CASE WHEN transaction_type = 'return_payment' THEN amount ELSE 0 END), 0) AS total_returns
        FROM transactions;
    """)

    row = cur.fetchone()

    cur.close()
    conn.close()

    total_receipts = row[0]
    total_expenses = row[1]
    total_payments = row[2]
    total_returns = row[3]

    return {
        "total_receipts": total_receipts,
        "total_expenses": total_expenses,
        "total_payments": total_payments,
        "total_returns": total_returns,
        "net_balance": total_receipts - total_expenses - total_payments - total_returns
    }
