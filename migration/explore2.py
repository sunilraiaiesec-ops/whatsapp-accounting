"""Crack the GUID-reference encoding and decode the Tabs object."""

from __future__ import annotations

import itertools
import sqlite3
import struct
import sys

from pbdecode import _read_varint, decode

DB = sys.argv[1]
con = sqlite3.connect(DB)
con.text_factory = bytes
cur = con.cursor()

# All object keys as normalized lowercase hex (no dashes) for matching.
cur.execute("SELECT CAST(Key AS TEXT) FROM Objects")
keys = {r[0].decode().replace("-", "").lower() for r in cur.fetchall()}
print("total keys:", len(keys))

# Grab a Payment object (79f99d26...) and pull the raw 16 bytes of a guid-like
# submessage (field 7 — constant across records, likely the cash account ref).
cur.execute(
    "SELECT Content FROM Objects WHERE CAST(ContentType AS TEXT)="
    "'79f99d26-e43a-4ecb-a9c9-0774601a9b2e' LIMIT 1"
)
content = cur.fetchone()[0]


def raw_submessage_bytes(buf: bytes, target_field: int) -> bytes | None:
    """Return the raw length-delimited payload bytes for a top-level field."""
    pos, n = 0, len(buf)
    while pos < n:
        tag, pos = _read_varint(buf, pos)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            _, pos = _read_varint(buf, pos)
        elif wire == 1:
            pos += 8
        elif wire == 2:
            ln, pos = _read_varint(buf, pos)
            sub = buf[pos:pos + ln]
            pos += ln
            if field == target_field:
                return sub
        elif wire == 5:
            pos += 4
        else:
            break
    return None


def extract_16(sub: bytes) -> bytes | None:
    """From a {fixed64,fixed64} submessage, pull the 16 GUID bytes in order."""
    d = decode(sub)
    if 1 in d and 2 in d and isinstance(d[1][0], dict) and "i" in d[1][0]:
        lo = struct.pack("<q", d[1][0]["i"])
        hi = struct.pack("<q", d[2][0]["i"])
        return lo + hi
    return None


def guid_candidates(b: bytes):
    """Yield candidate guid hex strings (no dashes) for 16 bytes via orderings."""
    yield b.hex()
    yield b[::-1].hex()
    # .NET Guid.ToByteArray layout: first 3 groups little-endian.
    d1 = b[0:4][::-1]
    d2 = b[4:6][::-1]
    d3 = b[6:8][::-1]
    rest = b[8:16]
    yield (d1 + d2 + d3 + rest).hex()
    # Reverse of that.
    yield (rest[::-1] + d3 + d2 + d1).hex()


for fld in (5, 7):
    sub = raw_submessage_bytes(content, fld)
    if not sub:
        print(f"field {fld}: none")
        continue
    b16 = extract_16(sub)
    print(f"\nfield {fld}: rawlen={len(sub)} 16bytes={b16.hex() if b16 else None}")
    if b16:
        for cand in guid_candidates(b16):
            if cand in keys:
                print(f"  MATCH ordering -> {cand}")

# Decode the Tabs object to confirm structure understanding.
print("\n--- Tabs object (ac789d1f) ---")
cur.execute(
    "SELECT Content FROM Objects WHERE CAST(ContentType AS TEXT)="
    "'ac789d1f-034f-4964-a8b5-ebfffc3511f2' LIMIT 1"
)
row = cur.fetchone()
if row:
    import json
    print(json.dumps(decode(row[0]), indent=2, default=str)[:1500])

con.close()
