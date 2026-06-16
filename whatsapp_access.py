"""WhatsApp session storage with multi-step flow state."""

from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import psycopg2.extras

from db import DEFAULT_BUSINESS_ID, get_db_connection

SESSION_HOURS = int(os.environ.get("WHATSAPP_SESSION_HOURS") or "8")
COMPANY_NAME = (os.environ.get("BUSINESS_NAME") or "RR Foods SARL").strip()

STATE_AWAITING_PIN = "awaiting_pin"
STATE_MAIN_MENU = "main_menu"
# Legacy alias kept for older rows
STATE_AWAITING_ACTION = "awaiting_action"

# Submission types (stored in selected_action during a flow)
TYPE_CASH_RECEIVED = "CASH_RECEIVED"
TYPE_EXPENSE = "EXPENSE"
TYPE_MERCHANDISE = "MERCHANDISE_RELEASE"
TYPE_BANK = "BANK_MOVEMENT"
TYPE_SUPPLIER = "SUPPLIER_PAYMENT"
TYPE_ADD_PARTY = "ADD_PARTY"


def get_staff_pin() -> str:
    return (os.environ.get("WHATSAPP_STAFF_PIN") or "").strip()


def staff_pin_enabled() -> bool:
    return bool(get_staff_pin())


def staff_pin_length() -> int:
    return len(get_staff_pin())


def verify_staff_pin(text: str) -> bool:
    staff_pin = get_staff_pin()
    if not staff_pin:
        return False
    cleaned = text.strip()
    if not cleaned.isdigit() or len(cleaned) != len(staff_pin):
        return False
    return secrets.compare_digest(cleaned, staff_pin)


def looks_like_pin_attempt(text: str) -> bool:
    staff_pin = get_staff_pin()
    if not staff_pin:
        return False
    cleaned = text.strip()
    return cleaned.isdigit() and len(cleaned) == len(staff_pin)


def get_company_name() -> str:
    return COMPANY_NAME or "RR Foods SARL"


_GREETINGS = {
    "hello", "hi", "hey", "bonjour", "salut", "bonsoir", "coucou", "hola",
    "good morning", "good afternoon", "good evening",
}


def is_greeting(text: str) -> bool:
    normalized = text.strip().lower().strip("!.,?")
    if not normalized:
        return False
    if normalized in _GREETINGS:
        return True
    first_word = normalized.split()[0]
    return first_word in _GREETINGS


def is_cancel_command(text: str) -> bool:
    normalized = text.strip().lower()
    return normalized in {"0", "cancel", "menu", "stop", "exit", "start over"}


def _session_expired(pin_verified_at: Optional[datetime]) -> bool:
    if not pin_verified_at:
        return True
    verified = pin_verified_at
    if verified.tzinfo is None:
        verified = verified.replace(tzinfo=timezone.utc)
    expires_at = verified + timedelta(hours=SESSION_HOURS)
    return datetime.now(timezone.utc) >= expires_at


def _ensure_tables() -> None:
    from db import ensure_default_business, ensure_whatsapp_sessions_table

    ensure_whatsapp_sessions_table()
    ensure_default_business()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS flow_data JSONB DEFAULT '{}';"
    )
    conn.commit()
    cur.close()
    conn.close()


def _normalize_state(state: Optional[str]) -> str:
    if state in (STATE_MAIN_MENU, STATE_AWAITING_ACTION, None):
        return STATE_MAIN_MENU
    return state or STATE_AWAITING_PIN


def _parse_flow_data(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def get_session(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> Optional[dict[str, Any]]:
    _ensure_tables()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT phone, state, selected_action, pin_verified_at, updated_at, flow_data
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
    session["state"] = _normalize_state(session.get("state"))
    session["flow_data"] = _parse_flow_data(session.get("flow_data"))
    if session["state"] != STATE_AWAITING_PIN and _session_expired(session.get("pin_verified_at")):
        reset_session(phone, business_id=business_id)
        return get_session(phone, business_id=business_id)
    return session


def _upsert_session(
    phone: str,
    *,
    state: str,
    selected_action: Optional[str],
    pin_verified_at: Optional[datetime],
    flow_data: Optional[dict[str, Any]] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> None:
    _ensure_tables()
    conn = get_db_connection()
    cur = conn.cursor()
    flow_json = psycopg2.extras.Json(flow_data or {})
    if pin_verified_at is None:
        cur.execute(
            """
            INSERT INTO whatsapp_sessions
            (business_id, phone, state, selected_action, pin_verified_at, flow_data)
            VALUES (%s, %s, %s, %s, NULL, %s)
            ON CONFLICT (business_id, phone) DO UPDATE SET
                state = EXCLUDED.state,
                selected_action = EXCLUDED.selected_action,
                pin_verified_at = EXCLUDED.pin_verified_at,
                flow_data = EXCLUDED.flow_data,
                updated_at = CURRENT_TIMESTAMP;
            """,
            (business_id, phone, state, selected_action, flow_json),
        )
    else:
        cur.execute(
            """
            INSERT INTO whatsapp_sessions
            (business_id, phone, state, selected_action, pin_verified_at, flow_data)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (business_id, phone) DO UPDATE SET
                state = EXCLUDED.state,
                selected_action = EXCLUDED.selected_action,
                pin_verified_at = EXCLUDED.pin_verified_at,
                flow_data = EXCLUDED.flow_data,
                updated_at = CURRENT_TIMESTAMP;
            """,
            (business_id, phone, state, selected_action, pin_verified_at, flow_json),
        )
    conn.commit()
    cur.close()
    conn.close()


def _preserve_lang_flow(
    phone: str,
    flow_data: Optional[dict[str, Any]] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> dict[str, Any]:
    session = get_session(phone, business_id=business_id) or {}
    existing_lang = (session.get("flow_data") or {}).get("lang")
    merged = dict(flow_data or {})
    if existing_lang:
        merged["lang"] = existing_lang
    return merged


def reset_session(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> None:
    _upsert_session(
        phone,
        state=STATE_AWAITING_PIN,
        selected_action=None,
        pin_verified_at=None,
        flow_data={},
        business_id=business_id,
    )


def set_main_menu(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> None:
    _upsert_session(
        phone,
        state=STATE_MAIN_MENU,
        selected_action=None,
        pin_verified_at=datetime.now(timezone.utc),
        flow_data=_preserve_lang_flow(phone, business_id=business_id),
        business_id=business_id,
    )


def set_session_after_pin(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> None:
    set_main_menu(phone, business_id=business_id)


def start_flow(
    phone: str,
    flow_type: str,
    first_step: str,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> None:
    _upsert_session(
        phone,
        state=first_step,
        selected_action=flow_type,
        pin_verified_at=datetime.now(timezone.utc),
        flow_data=_preserve_lang_flow(phone, business_id=business_id),
        business_id=business_id,
    )


def advance_step(
    phone: str,
    step: str,
    flow_data: Optional[dict[str, Any]] = None,
    business_id: int = DEFAULT_BUSINESS_ID,
) -> None:
    session = get_session(phone, business_id=business_id) or {}
    merged = dict(session.get("flow_data") or {})
    if flow_data:
        merged.update(flow_data)
    _upsert_session(
        phone,
        state=step,
        selected_action=session.get("selected_action"),
        pin_verified_at=session.get("pin_verified_at") or datetime.now(timezone.utc),
        flow_data=merged,
        business_id=business_id,
    )


def update_flow_data(
    phone: str,
    business_id: int = DEFAULT_BUSINESS_ID,
    **fields: Any,
) -> dict[str, Any]:
    session = get_session(phone, business_id=business_id) or {}
    merged = dict(session.get("flow_data") or {})
    merged.update(fields)
    _upsert_session(
        phone,
        state=session.get("state") or STATE_MAIN_MENU,
        selected_action=session.get("selected_action"),
        pin_verified_at=session.get("pin_verified_at") or datetime.now(timezone.utc),
        flow_data=merged,
        business_id=business_id,
    )
    return merged


def ensure_session_row(phone: str, business_id: int = DEFAULT_BUSINESS_ID) -> dict[str, Any]:
    _ensure_tables()
    session = get_session(phone, business_id=business_id)
    if session:
        return session
    reset_session(phone, business_id=business_id)
    session = get_session(phone, business_id=business_id)
    return session or {
        "phone": phone,
        "state": STATE_AWAITING_PIN,
        "selected_action": None,
        "flow_data": {},
    }
