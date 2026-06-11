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
            original_message TEXT,
            sender TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
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
import re

def parse_message(message: str) -> dict:
    message = message.strip()

    amount_match = re.search(r"(\d[\d,]*)", message)
    amount = None
    if amount_match:
        amount = int(amount_match.group(1).replace(",", ""))

    currency = "FCFA" if "fcfa" in message.lower() or "cfa" in message.lower() else None

    transaction_type = "unknown"
    party = None
    lower_message = message.lower()

    if "received from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(r"received from ([A-Za-z\s]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "give to" in lower_message:
        transaction_type = "payment"
        party_match = re.search(r"give to ([A-Za-z\s]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "paid" in lower_message:
        transaction_type = "expense"
        party_match = re.search(r"paid\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "return to" in lower_message:
        transaction_type = "return_payment"

    return {
        "original_message": message,
        "type": transaction_type,
        "party": party,
        "amount": amount,
        "currency": currency,
    }

@app.post("/analyze")
async def analyze_message(input_data: MessageInput):
    return parse_message(input_data.message)        "currency": currency
    }
