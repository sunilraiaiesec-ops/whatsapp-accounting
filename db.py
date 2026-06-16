import logging
import os
from typing import Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger("uvicorn.error")

DATABASE_URL = os.environ.get("DATABASE_URL")
DEFAULT_BUSINESS_ID = int(os.environ.get("DEFAULT_BUSINESS_ID", "1"))


def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set")
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

    cur.execute("""
        CREATE TABLE IF NOT EXISTS parties (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            party_type TEXT DEFAULT 'both',
            phone TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, normalized_name)
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            category_type TEXT NOT NULL,
            keywords TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, slug)
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            default_unit TEXT,
            default_unit_price_fcfa INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, normalized_name)
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS delivery_notes (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            employee_id INTEGER REFERENCES employees(id),
            party_id INTEGER REFERENCES parties(id),
            product_id INTEGER REFERENCES products(id),
            sender TEXT,
            whatsapp_message_id TEXT UNIQUE,
            whatsapp_media_id TEXT,
            document_number TEXT,
            document_type TEXT,
            route_note TEXT,
            client_name TEXT,
            delivery_date TEXT,
            description TEXT,
            quantity INTEGER,
            quantity_unit TEXT,
            unit_weight TEXT,
            total_weight TEXT,
            unit_price_fcfa INTEGER,
            line_total_fcfa INTEGER,
            truck_number TEXT,
            driver_name TEXT,
            driver_phone TEXT,
            driver_id_number TEXT,
            transporter TEXT,
            delivered_at TEXT,
            status TEXT DEFAULT 'pending_review',
            extraction_raw JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            phone TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'awaiting_pin',
            selected_action TEXT,
            pin_verified_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, phone)
        );
    """)

    migrations = [
        """
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            phone TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'awaiting_pin',
            selected_action TEXT,
            pin_verified_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, phone)
        );
        """,
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id);",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed';",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS party_id INTEGER REFERENCES parties(id);",
        "ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS party_id INTEGER REFERENCES parties(id);",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);",
        "ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);",
        "ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS unit_price_fcfa INTEGER;",
        "ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS line_total_fcfa INTEGER;",
        "ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS document_number_normalized TEXT;",
        "ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS flow_data JSONB DEFAULT '{}';",
        """
        CREATE TABLE IF NOT EXISTS accounting_submissions (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            employee_id INTEGER REFERENCES employees(id),
            sender TEXT NOT NULL,
            submission_type TEXT NOT NULL,
            receipt_id TEXT UNIQUE,
            amount INTEGER,
            payload JSONB NOT NULL,
            whatsapp_message_id TEXT,
            proof_media_id TEXT,
            status TEXT DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
    ]
    for statement in migrations:
        cur.execute(statement)

    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS delivery_notes_business_doc_norm_unique
        ON delivery_notes (business_id, document_number_normalized)
        WHERE document_number_normalized IS NOT NULL AND status != 'rejected';
    """)

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

    from categories import seed_categories
    from party_seeds import seed_default_customers

    seed_categories()
    seed_default_customers()


def ensure_whatsapp_sessions_table() -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS businesses (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.commit()
    cur.close()
    conn.close()

    ensure_default_business()

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id SERIAL PRIMARY KEY,
            business_id INTEGER REFERENCES businesses(id),
            phone TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'awaiting_pin',
            selected_action TEXT,
            pin_verified_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (business_id, phone)
        );
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_business_phone_unique
        ON whatsapp_sessions (business_id, phone);
        """
    )
    cur.execute(
        "ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS flow_data JSONB DEFAULT '{}';"
    )
    conn.commit()
    cur.close()
    conn.close()


def whatsapp_sessions_table_ready() -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'whatsapp_sessions'
            );
            """
        )
        return bool(cur.fetchone()[0])
    except Exception:
        logger.exception("Failed to check whatsapp_sessions table")
        return False
    finally:
        cur.close()
        conn.close()


def ensure_default_business() -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    business_name = (os.environ.get("BUSINESS_NAME") or "RR Foods SARL").strip()
    cur.execute("SELECT id FROM businesses WHERE id = %s;", (DEFAULT_BUSINESS_ID,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO businesses (id, name) VALUES (%s, %s);",
            (DEFAULT_BUSINESS_ID, business_name),
        )
    conn.commit()
    cur.close()
    conn.close()


def run_startup_backfills() -> None:
    """Link legacy rows to parties, categories, and products. Safe to retry."""
    steps = (
        ("parties", "parties", "backfill_party_links"),
        ("categories", "categories", "backfill_category_links"),
        ("products", "products", "backfill_delivery_products"),
        ("delivery_doc_numbers", "deliveries", "backfill_document_number_normalized"),
        ("delivery_roles", "db", "fix_delivery_submitter_roles"),
    )
    for label, module_name, fn_name in steps:
        try:
            module = __import__(module_name, fromlist=[fn_name])
            getattr(module, fn_name)()
            logger.info("Startup backfill finished: %s", label)
        except Exception:
            logger.exception("Startup backfill failed: %s", label)


def can_submit_delivery_note(employee: dict) -> bool:
    role = (employee.get("role") or "").lower()
    return any(phrase in role for phrase in ("owner", "warehouse"))


def fix_delivery_submitter_roles(business_id: int = DEFAULT_BUSINESS_ID) -> None:
    """Ensure warehouse staff can submit delivery note photos."""
    updates = [
        ("Hassan RR Cameroon", "Warehouse manager"),
        ("Ameet Kumar", "Warehouse manager"),
        ("Ameet Kumar (PK)", "Warehouse manager"),
    ]
    conn = get_db_connection()
    cur = conn.cursor()
    for name, role in updates:
        cur.execute(
            """
            UPDATE employees
            SET role = %s
            WHERE business_id = %s
              AND name = %s
              AND lower(coalesce(role, '')) NOT LIKE '%warehouse%'
              AND lower(coalesce(role, '')) NOT LIKE '%owner%';
            """,
            (role, business_id, name),
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


def try_claim_whatsapp_message(
    whatsapp_message_id: str,
    sender: str,
    message_text: str = "[processing]",
    raw_data: Optional[dict] = None,
) -> bool:
    """Reserve a WhatsApp message id before async processing (prevents double handling)."""
    if not whatsapp_message_id:
        return False
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO messages
            (business_id, source, sender, message_text, raw_data, whatsapp_message_id)
            VALUES (%s, %s, %s, %s, %s, %s);
            """,
            (
                DEFAULT_BUSINESS_ID,
                "whatsapp",
                sender,
                message_text,
                psycopg2.extras.Json(raw_data or {}),
                whatsapp_message_id,
            ),
        )
        conn.commit()
        return True
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return False
    finally:
        cur.close()
        conn.close()
