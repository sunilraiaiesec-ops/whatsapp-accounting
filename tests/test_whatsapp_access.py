import os

os.environ["WHATSAPP_STAFF_PIN"] = "123456"
os.environ["BUSINESS_NAME"] = "RR Foods SARL"

from whatsapp_access import (
    ACTION_CASH,
    ACTION_DELIVERY,
    get_company_name,
    is_greeting,
    looks_like_pin_attempt,
    parse_interactive_action,
    parse_text_action,
    staff_pin_enabled,
    verify_staff_pin,
)
from whatsapp_client import format_ask_pin_reply, format_welcome_pin_reply


def test_staff_pin_enabled():
    assert staff_pin_enabled() is True


def test_verify_staff_pin():
    assert verify_staff_pin("123456") is True
    assert verify_staff_pin("wrong") is False
    assert verify_staff_pin("12345") is False
    assert verify_staff_pin("1234567") is False


def test_is_greeting():
    assert is_greeting("Hello") is True
    assert is_greeting("Bonjour!") is True
    assert is_greeting("Hi there") is True
    assert is_greeting("Paid Ahmed 50000") is False


def test_looks_like_pin_attempt():
    assert looks_like_pin_attempt("123456") is True
    assert looks_like_pin_attempt("12345") is False


def test_welcome_pin_message():
    message = format_welcome_pin_reply("Hassan", "RR Foods SARL")
    assert "Hello Hassan Welcome to the RR Foods SARL Accounting Assistant" in message
    assert "6-digit PIN" in message


def test_ask_pin_reply_uses_company_name():
    message = format_ask_pin_reply("Ameet Kumar")
    assert "RR Foods SARL" in message
    assert get_company_name() == "RR Foods SARL"


def test_parse_text_action():
    assert parse_text_action("1") == ACTION_CASH
    assert parse_text_action("2") == ACTION_DELIVERY
    assert parse_text_action("menu") == "cancel"
    assert parse_text_action("Paid Ahmed 50000") is None


def test_parse_interactive_action():
    message = {
        "interactive": {
            "type": "button_reply",
            "button_reply": {"id": "action_cash", "title": "Cash update"},
        }
    }
    assert parse_interactive_action(message) == ACTION_CASH

    delivery_message = {
        "interactive": {
            "type": "button_reply",
            "button_reply": {"id": "action_delivery", "title": "Delivery photo"},
        }
    }
    assert parse_interactive_action(delivery_message) == ACTION_DELIVERY
