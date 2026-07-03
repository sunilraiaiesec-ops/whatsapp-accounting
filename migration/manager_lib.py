"""Shared helpers + constants for decoding a Manager .manager backup.

Encodings (reverse-engineered & validated against this file):
  * GUID refs : protobuf {1:fixed64 lo, 2:fixed64 hi}; bytes reordered with
                the .NET Guid.ToByteArray layout (first 3 groups little-endian).
  * Amounts   : integer in submessage {1: N}.  Base currency = XAF (no minor unit).
  * Dates     : value is HALF-DAYS; date = 1970-01-01 + (value // 2) days.
  * Money out : Payments.   Money in: Receipts.   Both have repeated line items.
"""
from __future__ import annotations

import datetime as dt
import struct
import sqlite3

from pbdecode import decode

EPOCH = dt.date(1970, 1, 1)

# Content-type GUID -> human label (universal across all Manager businesses).
CT = {
    "1408c33b-6284-4f50-9e31-48cbea21f3cf": "BankCashAccount",
    "26b9e4a5-ce10-4f30-94c7-23a1ca4428f9": "Account",            # P&L / COA account
    "5770616c-0e01-46ca-a172-f7042275da6c": "AccountGroup",
    "ec37c11e-2b67-49c6-8a58-6eccb7dd75ee": "Customer",
    "6d2dc48d-2053-4e45-8330-285ebd431242": "Supplier",
    "58b9eb90-f6b8-4abc-8ea1-12fd77b8336e": "InventoryItem",
    "fae8151d-252e-45e3-b1f4-e048075b8983": "InventoryLocation",
    "79f99d26-e43a-4ecb-a9c9-0774601a9b2e": "Payment",
    "7662b887-c8d8-486e-98fd-f9dbcd41c6dc": "Receipt",
    "dea4f923-c498-4504-b3ef-30be3c33175e": "InterAccountTransfer",
    "a0f6a539-f6a4-4a38-a69a-546a608a1f6d": "DeliveryNote",
    "ad12b60b-23bf-4421-94df-8be79cef533e": "SalesInvoice",
    "866217a4-f841-47de-a4e6-87152405c88d": "PurchaseInvoice",
    "7eaafddc-54c9-4235-98d2-e8a1ee438150": "InventoryTransfer",
    "d7ff6694-f1ef-419f-8ae2-55527a02e95f": "InventoryWriteOff",
}


def guid_of(v):
    """Reconstruct a GUID string from a decoded {_msg:{1:[{i}],2:[{i}]}} value."""
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if 1 in m and 2 in m and isinstance(m[1][0], dict) and "i" in m[1][0]:
            b = struct.pack("<q", m[1][0]["i"]) + struct.pack("<q", m[2][0]["i"])
            g = (b[0:4][::-1] + b[4:6][::-1] + b[6:8][::-1] + b[8:16]).hex()
            return f"{g[0:8]}-{g[8:12]}-{g[12:16]}-{g[16:20]}-{g[20:32]}"
    return None


def to_date(v):
    """Decode a date value {_msg:{1:[halfdays]}} -> ISO date string."""
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if 1 in m and isinstance(m[1][0], int):
            return (EPOCH + dt.timedelta(days=m[1][0] // 2)).isoformat()
    return None


def num_of(v):
    """Decode a Manager decimal {1: mantissa, 3: scale} -> float/int.

    scale (field 3) is 2x the number of decimal places (same x2 convention as
    dates). Absent scale => whole number (the common case for XAF amounts).
    """
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if 1 in m and isinstance(m[1][0], int):
            mant = m[1][0]
            scale2 = m[3][0] if 3 in m and isinstance(m[3][0], int) else 0
            return mant / (10 ** (scale2 // 2)) if scale2 else mant
    return 0


def amount_of(v):
    """Decode a monetary amount -> int XAF (rounded; XAF has no minor unit)."""
    n = num_of(v)
    return int(round(n)) if isinstance(n, float) else n


def first_str(d, *fields):
    for f in fields:
        for v in d.get(f, []):
            if isinstance(v, str) and v.strip():
                return v
    return None


def load_objects(db_path):
    """Return {key: {'type': label, 'ct': guid, 'd': decoded}}."""
    con = sqlite3.connect(db_path)
    con.text_factory = bytes
    cur = con.cursor()
    cur.execute("SELECT CAST(Key AS TEXT), CAST(ContentType AS TEXT), Content FROM Objects")
    objs = {}
    for k, ct, content in cur.fetchall():
        k = k.decode(); ct = ct.decode()
        try:
            d = decode(content) if content else {}
        except Exception:
            d = {}
        objs[k] = {"ct": ct, "type": CT.get(ct, ct[:8]), "d": d}
    con.close()
    return objs
