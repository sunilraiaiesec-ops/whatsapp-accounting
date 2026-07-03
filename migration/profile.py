"""Profile each ContentType in a Manager backup: counts + decoded samples."""

from __future__ import annotations

import json
import sqlite3
import sys

from pbdecode import decode

DB = sys.argv[1]
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 2

con = sqlite3.connect(DB)
con.text_factory = bytes
cur = con.cursor()

cur.execute(
    "SELECT CAST(ContentType AS TEXT), COUNT(*) FROM Objects "
    "GROUP BY ContentType ORDER BY COUNT(*) DESC"
)
types = cur.fetchall()

for ct_b, count in types:
    ct = ct_b.decode() if isinstance(ct_b, bytes) else ct_b
    print(f"\n{'='*78}\nCONTENTTYPE {ct}   count={count}")
    cur.execute(
        "SELECT Content FROM Objects WHERE CAST(ContentType AS TEXT)=? LIMIT ?",
        (ct, LIMIT),
    )
    for (content,) in cur.fetchall():
        if content is None:
            print("  <null>")
            continue
        try:
            d = decode(content)
            print(json.dumps(d, indent=2, default=str)[:1600])
        except Exception as e:  # noqa: BLE001
            print(f"  decode error: {e}")

con.close()
