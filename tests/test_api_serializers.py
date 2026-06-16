from datetime import date, datetime
from decimal import Decimal

from api_serializers import serialize_data


def test_serialize_dates_and_decimals():
    payload = {
        "created_at": datetime(2026, 6, 13, 12, 30, 0),
        "delivery_date": date(2026, 6, 13),
        "amount": Decimal("1500"),
        "nested": [{"when": date(2026, 1, 1)}],
    }
    result = serialize_data(payload)
    assert result["created_at"] == "2026-06-13T12:30:00"
    assert result["delivery_date"] == "2026-06-13"
    assert result["amount"] == 1500
    assert result["nested"][0]["when"] == "2026-01-01"
