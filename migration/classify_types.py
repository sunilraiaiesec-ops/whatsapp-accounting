"""Fingerprint every content type: field kinds + sample string values."""

from __future__ import annotations

import datetime as dt
import struct
import sys
import sqlite3
from collections import defaultdict

from pbdecode import decode

DB = sys.argv[1]
OA = dt.date(1899, 12, 30)


def guid_from_msg(v):
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if 1 in m and 2 in m and isinstance(m[1][0], dict) and "i" in m[1][0]:
            lo = struct.pack("<q", m[1][0]["i"]); hi = struct.pack("<q", m[2][0]["i"])
            b = lo + hi
            g = (b[0:4][::-1] + b[4:6][::-1] + b[6:8][::-1] + b[8:16]).hex()
            return f"{g[0:8]}-{g[8:12]}-{g[12:16]}-{g[16:20]}-{g[20:32]}"
    return None


con = sqlite3.connect(DB)
con.text_factory = bytes
cur = con.cursor()
cur.execute("SELECT CAST(Key AS TEXT), CAST(ContentType AS TEXT), Content FROM Objects")
rows = [(k.decode(), ct.decode(), c) for k, ct, c in cur.fetchall()]
con.close()

# Map key -> a readable name for cross typing.
keyname = {}
keytype = {}
decoded = {}
for k, ct, c in rows:
    keytype[k] = ct
    d = decode(c) if c else {}
    decoded[k] = d
    nm = None
    for f in (1, 2, 6, 10):
        for v in d.get(f, []):
            if isinstance(v, str) and v and not v.replace('.', '').replace(',', '').isdigit():
                nm = v[:40]; break
        if nm:
            break
    keyname[k] = nm

bytype = defaultdict(list)
for k, ct, c in rows:
    bytype[ct].append(k)


def kind(v):
    g = guid_from_msg(v)
    if g:
        return f"GUID->{keytype.get(g, '?')[:8]}"
    if isinstance(v, str):
        return "str"
    if isinstance(v, int):
        return "int"
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if list(m.keys()) == [1] and isinstance(m[1][0], int):
            return "num1"
        return "msg"
    if isinstance(v, dict) and "i" in v:
        return "64b"
    return "?"


for ct in sorted(bytype, key=lambda c: -len(bytype[c])):
    keys = bytype[ct]
    fieldkinds = defaultdict(set)
    samplestr = {}
    for k in keys[:40]:
        for f, vals in decoded[k].items():
            for v in vals:
                fieldkinds[f].add(kind(v))
                if isinstance(v, str) and f not in samplestr and v.strip():
                    samplestr[f] = v[:32]
    fields = ", ".join(
        f"f{f}:{'/'.join(sorted(fieldkinds[f]))}" + (f"='{samplestr[f]}'" if f in samplestr else "")
        for f in sorted(fieldkinds)
    )
    print(f"\n[{len(keys):5d}] {ct}\n    {fields}")
