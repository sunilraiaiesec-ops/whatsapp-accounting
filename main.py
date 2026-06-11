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
