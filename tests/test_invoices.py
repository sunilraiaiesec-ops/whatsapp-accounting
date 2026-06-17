from decimal import Decimal

from invoices import _format_invoice_number, _line_total


def test_format_invoice_number():
    assert _format_invoice_number(1) == "INV-000001"
    assert _format_invoice_number(123) == "INV-000123"


def test_line_total_rounds_half_up():
    assert _line_total(Decimal("10"), 74000) == 740000
    assert _line_total(Decimal("1.5"), 1000) == 1500
    assert _line_total(Decimal("2.5"), 1001) == 2503
