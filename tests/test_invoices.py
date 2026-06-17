from decimal import Decimal

from invoices import _format_invoice_number, _line_total


def test_format_invoice_number():
    assert _format_invoice_number(1) == "INV-000001"
    assert _format_invoice_number(123) == "INV-000123"


def test_line_total_rounds_half_up():
    assert _line_total(Decimal("10"), 74000) == 740000
    assert _line_total(Decimal("1.5"), 1000) == 1500
    assert _line_total(Decimal("2.5"), 1001) == 2503


def test_parse_decimal_quantity():
    from whatsapp_flow import _parse_decimal

    assert _parse_decimal("3") == 3.0
    assert _parse_decimal("2.5") == 2.5
    assert _parse_decimal("2,5") == 2.5
    assert _parse_decimal("1 200") == 1200.0
    assert _parse_decimal("abc") is None
    assert _parse_decimal("0") is None
    assert _parse_decimal("") is None


def test_coerce_cost():
    from decimal import Decimal

    import pytest

    from inventory import _coerce_cost

    assert _coerce_cost(None) is None
    assert _coerce_cost("") is None
    assert _coerce_cost("1500") == Decimal("1500")
    assert _coerce_cost(1500.5) == Decimal("1500.5")
    assert _coerce_cost(0) == Decimal("0")
    with pytest.raises(ValueError):
        _coerce_cost("-1")
    with pytest.raises(ValueError):
        _coerce_cost("abc")
