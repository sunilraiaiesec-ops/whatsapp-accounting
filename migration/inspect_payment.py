"""Deep-inspect a few payment/receipt records with resolved references."""

from __future__ import annotations

import datetime as dt
import json
import struct
import sys
import sqlite3

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
objs = {}
for k, ct, content in cur.fetchall():
    objs[k.decode()] = (ct.decode(), content)


def short(key):
    if key in objs:
        ct, content = objs[key]
        d = decode(content) if content else {}
        nm = None
        for f in (1, 2, 6, 10):
            for v in d.get(f, []):
                if isinstance(v, str) and v and not v.replace('.', '').isdigit():
                    nm = v[:40]; break
            if nm:
                break
        return f"{ct[:8]}:{nm}"
    return "?"


def walk(d, depth=0):
    """Pretty print decoded dict, resolving guids & dates inline."""
    pad = "  " * depth
    out = []
    for f in sorted(d):
        for v in d[f]:
            g = guid_from_msg(v)
            if g:
                out.append(f"{pad}f{f}= GUID {g}  -> {short(g)}")
            elif isinstance(v, dict) and "_msg" in v:
                m = v["_msg"]
                if 1 in m and len(m) == 1 and isinstance(m[1][0], int):
                    n = m[1][0]
                    try:
                        ds = (OA + dt.timedelta(days=n)).isoformat()
                    except OverflowError:
                        ds = "n/a"
                    out.append(f"{pad}f{f}= NUM/{n}  (asDate={ds})")
                else:
                    out.append(f"{pad}f{f}= msg:")
                    out.append(walk(m, depth + 1))
            elif isinstance(v, dict) and "i" in v:
                out.append(f"{pad}f{f}= 64bit i={v['i']} f={v['f']}")
            else:
                out.append(f"{pad}f{f}= {v}")
    return "\n".join(out)


cur.execute(
    "SELECT CAST(Key AS TEXT), Content, Timestamp FROM Objects "
    "WHERE CAST(ContentType AS TEXT)=? LIMIT 3", (sys.argv[2],))
for k, content, ts in cur.fetchall():
    k = k.decode()
    print(f"\n===== {k}  Timestamp={ts} =====")
    print(walk(decode(content)))
con.close()
