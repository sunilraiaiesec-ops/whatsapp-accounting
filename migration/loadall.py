"""Load all Manager objects, resolve GUID refs, label content types."""

from __future__ import annotations

import datetime as dt
import json
import struct
import sys

import sqlite3

from pbdecode import decode

DB = sys.argv[1]
OA_EPOCH = dt.date(1899, 12, 30)  # Excel/OLE automation date epoch


def guid_from_msg(v) -> str | None:
    """Reconstruct a GUID string from a decoded {1:[{i}],2:[{i}]} submessage."""
    if not isinstance(v, dict) or "_msg" not in v:
        return None
    m = v["_msg"]
    if 1 in m and 2 in m and isinstance(m[1][0], dict) and "i" in m[1][0]:
        lo = struct.pack("<q", m[1][0]["i"])
        hi = struct.pack("<q", m[2][0]["i"])
        b = lo + hi
        g = (b[0:4][::-1] + b[4:6][::-1] + b[6:8][::-1] + b[8:16]).hex()
        return f"{g[0:8]}-{g[8:12]}-{g[12:16]}-{g[16:20]}-{g[20:32]}"
    return None


def as_date(v):
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if 1 in m and isinstance(m[1][0], int):
            return (OA_EPOCH + dt.timedelta(days=m[1][0])).isoformat()
    return None


con = sqlite3.connect(DB)
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
    objs[k] = {"ct": ct, "d": d}
con.close()
print("loaded", len(objs))


def name_of(key):
    o = objs.get(key)
    if not o:
        return None
    d = o["d"]
    # try common name-ish fields
    for f in (1, 2, 3, 6, 10):
        for v in d.get(f, []):
            if isinstance(v, str) and v and not v.isdigit():
                return v[:50]
    return None


# Label the field-7 target referenced by Payments.
target = "2d1b2e66-e380-4038-be2e-c3ec2068234e"
print("\nfield7 target:", target, "ct=", objs.get(target, {}).get("ct"))
print("  decoded:", json.dumps(objs.get(target, {}).get("d"), default=str)[:400])

# For the 4 biggest content types, show date range (OA epoch).
from collections import Counter, defaultdict
byct = defaultdict(list)
for k, o in objs.items():
    byct[o["ct"]].append(k)

big = sorted(byct, key=lambda c: -len(byct[c]))[:6]
for ct in big:
    days = []
    for k in byct[ct]:
        d = objs[k]["d"]
        for f in (1, 3):
            for v in d.get(f, []):
                if isinstance(v, dict) and "_msg" in v and 1 in v["_msg"] and isinstance(v["_msg"][1][0], int):
                    days.append(v["_msg"][1][0]); break
    if days:
        lo = OA_EPOCH + dt.timedelta(days=min(days))
        hi = OA_EPOCH + dt.timedelta(days=max(days))
        print(f"\n{ct} n={len(byct[ct])} dateRange[OA]={lo}..{hi}")
    else:
        print(f"\n{ct} n={len(byct[ct])} (no date)")
