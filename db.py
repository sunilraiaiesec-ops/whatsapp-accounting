import os

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")
DEFAULT_BUSINESS_ID = int(os.environ.get("DEFAULT_BUSINESS_ID", "1"))


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def normalize_phone(phone: str) -> str:
    return "".join(ch for ch in phone if ch.isdigit())


def create_tables():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS businesses (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            phone TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, phone)
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            source TEXT,
            sender TEXT,
            message_text TEXT,
            raw_data JSONB,
            whatsapp_message_id TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            transaction_type TEXT,
            party TEXT,
            amount INTEGER,
            currency TEXT,
            category TEXT,
            original_message TEXT,
            sender TEXT,
            employee_id INTEGER REFERENCES employees(id),
            status TEXT DEFAULT 'confirmed',
            whatsapp_message_id TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    migrations = [
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id);",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed';",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;",
    ]
    for statement in migrations:
        cur.execute(statement)

    business_name = os.environ.get("BUSINESS_NAME", "My Business")
    cur.execute("SELECT id FROM businesses WHERE id = %s;", (DEFAULT_BUSINESS_ID,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO businesses (id, name) VALUES (%s, %s);",
            (DEFAULT_BUSINESS_ID, business_name),
        )
        cur.execute(
            "SELECT setval(pg_get_serial_sequence('businesses', 'id'), "
            "GREATEST((SELECT MAX(id) FROM businesses), 1));"
        )

    cur.execute(
        "UPDATE messages SET business_id = %s WHERE business_id IS NULL;",
        (DEFAULT_BUSINESS_ID,),
    )
    cur.execute(
        "UPDATE transactions SET business_id = %s WHERE business_id IS NULL;",
        (DEFAULT_BUSINESS_ID,),
    )
    cur.execute(
        "UPDATE transactions SET status = 'confirmed' WHERE status IS NULL;"
    )

    conn.commit()
    cur.close()
    conn.close()


def get_employee_by_phone(phone: str, business_id: int = DEFAULT_BUSINESS_ID):
    normalized = normalize_phone(phone)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, name, role, phone
        FROM employees
        WHERE business_id = %s
          AND is_active = TRUE
          AND regexp_replace(phone, '[^0-9]', '', 'g') = %s
        LIMIT 1;
        """,
        (business_id, normalized),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def message_exists(whatsapp_message_id: str) -> bool:
    if not whatsapp_message_id:
        return False
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM messages WHERE whatsapp_message_id = %s LIMIT 1;",
        (whatsapp_message_id,),
    )
    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    return exists
