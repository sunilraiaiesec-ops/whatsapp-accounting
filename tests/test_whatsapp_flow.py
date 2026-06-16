import os

os.environ["WHATSAPP_STAFF_PIN"] = "123456"

from whatsapp_flow import _parse_amount, _parse_choice, MENU_CHOICES


def test_parse_amount():
    assert _parse_amount("50000") == 50000
    assert _parse_amount("50,000 FCFA") == 50000
    assert _parse_amount("hello") is None


def test_parse_choice():
    valid = {"1": "a", "2": "b"}
    assert _parse_choice("1", valid) == "1"
    assert _parse_choice("9", valid) is None


def test_menu_has_five_flows():
    assert len(MENU_CHOICES) == 5
    assert "1" in MENU_CHOICES
    assert "5" in MENU_CHOICES
