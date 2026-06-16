import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection

STAFF_PIN = (os.environ.get("WHATSAPP_STAFF_PIN") or "").strip()
SESSION_HOURS = int(os.environ.get("WHATSAPP_SESSION_HOURS") or "8")
COMPANY_NAME = (os.environ.get("BUSINESS_NAME") or "RR Foods SARL").strip()
PIN_LENGTH = 6

STATE_AWAITING_PIN = "awaiting_pin"
STATE_AWAITING_ACTION = "awaiting_action"
STATE_CASH = "cash"
STATE_DELIVERY = "delivery"

ACTION_CASH = "cash"
ACTION_DELIVERY = "delivery"
ACTION_CANCEL = "cancel"


def staff_pin_enabled() -> bool:
    return bool(STAFF_PIN)


def verify_staff_pin(text: str) -> bool:
    if not STAFF_PIN:
        return False
    cleaned = text.strip()
    if not cleaned.isdigit() or len(cleaned) != PIN_LENGTH:
        return False
    return secrets.compare_digest(cleaned, STAFF_PIN)


def get_company_name() -> str:
    return COMPANY_NAME or "RR Foods SARL"


def looks_like_pin_attempt(text: str) -> bool:
    cleaned = text.strip()
    return cleaned.isdigit() and len(cleaned) == PIN_LENGTH


_GREETINGS = {
    "hello",
    "hi",
    "hey",
    "bonjour",
    "salut",
    "bonsoir",
    "coucou",
    "hola",
    "good morning",
    "good afternoon",
    "good evening",
}


def is_greeting(text: str) -> bool:
    normalized = text.strip().lower().strip("!.,?")
    if not normalized:
        return False
    if normalized in _GREETINGS:
        return True
    first_word = normalized.split()[0]
    return first_word in _GREETINGS


def _session_expired(pin_verified_at: Optional[datetime]) -> bool:
    if not pin_verified_at:
        return True
    verified = pin_verified_at
    if verified.tzinfo is None:
        verified = verified.replace(tzinfo=timezone.utc)
    expires_at = verified + timedelta(hours=SESSION_HOURS)
    return datetime.now(timezone.utc) >= expires_at


def get_session(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT phone, state, selected_action, pin_verified_at, updated_at
        FROM whatsapp_sessions
        WHERE business_id = %s AND phone = %s
        LIMIT 1;
        """,
        (business_id, phone),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    session = dict(row)
    if session["state"] != STATE_AWAITING_PIN and _session_expired(session.get("pin_verified_at")):
        reset_session(phone, business_id=business_id)
        return get_session(phone, business_id=business_id)
    return session


def reset_session(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO whatsapp_sessions (business_id, phone, state, selected_action, pin_verified_at)
        VALUES (%s, %s, %s, NULL, NULL)
        ON CONFLICT (business_id, phone) DO UPDATE SET
            state = EXCLUDED.state,
            selected_action = NULL,
            pin_verified_at = NULL,
            updated_at = CURRENT_TIMESTAMP;
        """,
        (business_id, phone, STATE_AWAITING_PIN),
    )
    conn.commit()
    cur.close()
    conn.close()


def set_session_after_pin(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO whatsapp_sessions (business_id, phone, state, selected_action, pin_verified_at)
        VALUES (%s, %s, %s, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT (business_id, phone) DO UPDATE SET
            state = EXCLUDED.state,
            selected_action = NULL,
            pin_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP;
        """,
        (business_id, phone, STATE_AWAITING_ACTION),
    )
    conn.commit()
    cur.close()
    conn.close()


def set_session_action(
    phone: str,
    action: str,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> None:
    state = STATE_CASH if action == ACTION_CASH else STATE_DELIVERY
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE whatsapp_sessions
        SET state = %s,
            selected_action = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE business_id = %s AND phone = %s;
        """,
        (state, action, business_id, phone),
    )
    conn.commit()
    cur.close()
    conn.close()


def parse_interactive_action(message: dict) -> Optional[str]:
    interactive = message.get("interactive") or {}
    if interactive.get("type") == "button_reply":
        button_id = interactive.get("button_reply", {}).get("id")
        if button_id in ("action_cash", "cash"):
            return ACTION_CASH
        if button_id in ("action_delivery", "delivery"):
            return ACTION_DELIVERY
        if button_id in ("action_cancel", "cancel"):
            return ACTION_CANCEL
    if interactive.get("type") == "list_reply":
        row_id = interactive.get("list_reply", {}).get("id")
        if row_id in ("action_cash", "cash"):
            return ACTION_CASH
        if row_id in ("action_delivery", "delivery"):
            return ACTION_DELIVERY
        if row_id in ("action_cancel", "cancel"):
            return ACTION_CANCEL
    return None


def parse_text_action(text: str) -> Optional[str]:
    normalized = text.strip().lower()
    if normalized in {"1", "cash", "money", "payment", "receipt", "expense"}:
        return ACTION_CASH
    if normalized in {"2", "delivery", "photo", "note", "bon"}:
        return ACTION_DELIVERY
    if normalized in {"0", "cancel", "menu", "stop", "exit"}:
        return ACTION_CANCEL
    return None


def is_menu_command(text: str) -> bool:
    return parse_text_action(text) == ACTION_CANCEL


def ensure_session_row(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> dict[str, Any]:
    session = get_session(phone, business_id=business_id)
    if session:
        return session
    reset_session(phone, business_id=business_id)
    session = get_session(phone, business_id=business_id)
    return session or {"phone": phone, "state": STATE_AWAITING_PIN, "selected_action": None}
