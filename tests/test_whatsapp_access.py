import os

os.environ["WHATSAPP_STAFF_PIN"] = "123456"
os.environ["BUSINESS_NAME"] = "RR Foods SARL"

from whatsapp_access import (
    get_company_name,
    is_cancel_command,
    is_greeting,
    looks_like_pin_attempt,
    staff_pin_enabled,
    verify_staff_pin,
)
from whatsapp_prompts import format_master_menu


def test_staff_pin_enabled():
    assert staff_pin_enabled() is True


def test_verify_staff_pin():
    assert verify_staff_pin("123456") is True
    assert verify_staff_pin("wrong") is False
    assert verify_staff_pin("12345") is False
    assert verify_staff_pin("1234567") is False


def test_looks_like_pin_attempt():
    assert looks_like_pin_attempt("123456") is True
    assert looks_like_pin_attempt("12345") is False
    assert looks_like_pin_attempt("hello") is False


def test_is_greeting():
    assert is_greeting("Hello") is True
    assert is_greeting("Bonjour!") is True
    assert is_greeting("Hi there") is True
    assert is_greeting("Paid Ahmed 50000") is False


def test_is_cancel_command():
    assert is_cancel_command("0") is True
    assert is_cancel_command("menu") is True
    assert is_cancel_command("50000") is False


def test_welcome_pin_message():
    from whatsapp_client import format_welcome_pin_reply

    message = format_welcome_pin_reply("Hassan", "RR Foods SARL")
    assert "Hello Hassan Welcome to the RR Foods SARL Accounting Assistant" in message
    assert "6-digit PIN" in message


def test_ask_pin_reply_uses_company_name():
    from whatsapp_client import format_ask_pin_reply

    message = format_ask_pin_reply("Ameet Kumar")
    assert "RR Foods SARL" in message
    assert get_company_name() == "RR Foods SARL"


def test_master_menu_lists_all_choices():
    menu = format_master_menu("Kumar")
    assert "1 — 💰 Cash Received" in menu
    assert "2 — 🛑 Cash Expense Made" in menu
    assert "3 — 🚚 Truck Loading" in menu
    assert "4 — 🏦 Bank Deposit" in menu
    assert "5 — 🚢 Supplier" in menu
    assert "0 — ❌ Cancel" in menu
