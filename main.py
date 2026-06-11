import os
import json
import psycopg2
from fastapi import FastAPI, Request

app = FastAPI()

DATABASE_URL = os.environ.get("DATABASE_URL")


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
async def save_test_message(request: Request):
    data = await request.json()

    message_text = data.get("message", "")
    sender = data.get("sender", "manual-test")

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages (source, sender, message_text, raw_data)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        ("manual", sender, message_text, json.dumps(data))
    )

    message_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "saved",
        "message_id": message_id,
        "message": message_text
    }


@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    data = await request.json()

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages (source, sender, message_text, raw_data)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        ("whatsapp", "unknown", json.dumps(data), json.dumps(data))
    )

    message_id = cur.fetchone()[0]

    conn.commit()
    cur.close()
    conn.close()

    return {
        "status": "received",
        "message_id": message_id
    }
