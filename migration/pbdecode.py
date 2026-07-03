"""Generic Protocol Buffers wire-format decoder for Manager .manager backups.

Manager stores every object in the SQLite `Objects` table with a binary
protobuf `Content`. There's no published schema, so we decode the wire format
generically into a nested structure and infer field meanings empirically.
"""

from __future__ import annotations

import struct
from typing import Any


def _read_varint(buf: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            break
        shift += 7
    return result, pos


def _looks_text(b: bytes) -> bool:
    if not b:
        return False
    try:
        s = b.decode("utf-8")
    except UnicodeDecodeError:
        return False
    printable = sum(1 for c in s if c.isprintable() or c in "\n\r\t")
    return printable / len(s) > 0.85


def decode(buf: bytes, depth: int = 0, max_depth: int = 8) -> dict[int, list[Any]]:
    """Decode protobuf bytes into {field_number: [values...]}.

    Length-delimited values are returned as one of:
      - {"_msg": {...}} if they parse cleanly as a nested message
      - str if they look like UTF-8 text
      - {"_bytes_len": n, "_hex": "..."} otherwise
    Varints are returned as int; 64-bit as {"i": int, "f": double};
    32-bit as {"i": int, "f": float}.
    """
    out: dict[int, list[Any]] = {}
    pos = 0
    n = len(buf)
    while pos < n:
        try:
            tag, pos = _read_varint(buf, pos)
        except IndexError:
            break
        field = tag >> 3
        wire = tag & 0x7
        if wire == 0:  # varint
            val, pos = _read_varint(buf, pos)
            out.setdefault(field, []).append(val)
        elif wire == 1:  # 64-bit
            if pos + 8 > n:
                break
            raw = buf[pos:pos + 8]
            pos += 8
            out.setdefault(field, []).append({
                "i": struct.unpack("<q", raw)[0],
                "f": struct.unpack("<d", raw)[0],
            })
        elif wire == 2:  # length-delimited
            ln, pos = _read_varint(buf, pos)
            if pos + ln > n:
                break
            sub = buf[pos:pos + ln]
            pos += ln
            value: Any
            nested = None
            if depth < max_depth and ln > 0:
                try:
                    cand = decode(sub, depth + 1, max_depth)
                    # Accept nested only if it consumed plausibly (non-empty).
                    if cand:
                        nested = cand
                except Exception:
                    nested = None
            if _looks_text(sub):
                value = sub.decode("utf-8")
            elif nested is not None:
                value = {"_msg": nested}
            else:
                value = {"_bytes_len": ln, "_hex": sub[:32].hex()}
            out.setdefault(field, []).append(value)
        elif wire == 5:  # 32-bit
            if pos + 4 > n:
                break
            raw = buf[pos:pos + 4]
            pos += 4
            out.setdefault(field, []).append({
                "i": struct.unpack("<i", raw)[0],
                "f": struct.unpack("<f", raw)[0],
            })
        else:
            # Unknown wire type — stop to avoid garbage.
            break
    return out
