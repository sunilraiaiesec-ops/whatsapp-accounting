from datetime import date, datetime
from decimal import Decimal
from typing import Any


def serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    return value


def serialize_data(data: Any) -> Any:
    if isinstance(data, dict):
        return {key: serialize_data(val) for key, val in data.items()}
    if isinstance(data, list):
        return [serialize_data(item) for item in data]
    return serialize_value(data)
