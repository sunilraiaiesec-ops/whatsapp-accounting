import os

os.environ["WHATSAPP_STAFF_PIN"] = "1234"

from whatsapp_access import (
    ACTION_CASH,
    ACTION_DELIVERY,
    parse_interactive_action,
    parse_text_action,
    staff_pin_enabled,
    verify_staff_pin,
)


def test_staff_pin_enabled():
    assert staff_pin_enabled() is True


def test_verify_staff_pin():
    assert verify_staff_pin("1234") is True
    assert verify_staff_pin("wrong") is False
    assert verify_staff_pin(" 1234 ") is False


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
