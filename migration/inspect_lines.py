"""Inspect repeated line structure + amount encoding for payments/receipts."""
from __future__ import annotations
import struct, sys, sqlite3, json
from pbdecode import decode

DB = sys.argv[1]
con = sqlite3.connect(DB); con.text_factory = bytes; cur = con.cursor()


def gz(v):
    if isinstance(v, dict) and "_msg" in v:
        m = v["_msg"]
        if 1 in m and 2 in m and isinstance(m[1][0], dict) and "i" in m[1][0]:
            lo = struct.pack("<q", m[1][0]["i"]); hi = struct.pack("<q", m[2][0]["i"])
            b = lo + hi
            g = (b[0:4][::-1]+b[4:6][::-1]+b[6:8][::-1]+b[8:16]).hex()
            return f"{g[0:8]}-{g[8:12]}-{g[12:16]}-{g[16:20]}-{g[20:32]}"
    return None

# Find a payment with MULTIPLE lines (f11 repeated) and a non-round amount.
cur.execute("SELECT Content FROM Objects WHERE CAST(ContentType AS TEXT)='79f99d26-e43a-4ecb-a9c9-0774601a9b2e'")
multi=None; nonround=None
for (c,) in cur.fetchall():
    d=decode(c)
    lines=d.get(11,[])
    if len(lines)>1 and multi is None: multi=d
    for ln in lines:
        if isinstance(ln,dict) and "_msg" in ln:
            amt=ln["_msg"].get(18,[])
            for a in amt:
                if isinstance(a,dict) and "_msg" in a:
                    am=a["_msg"]
                    if 1 in am and isinstance(am[1][0],int) and am[1][0]%1000!=0 and nonround is None:
                        nonround=(am, d)
    if multi and nonround: break

print("=== MULTI-LINE PAYMENT (raw f11) ===")
if multi:
    print(json.dumps(multi.get(11), default=str)[:1200])
print("\n=== NON-ROUND AMOUNT submsg ===")
print(nonround[0] if nonround else "none found (all round)")

# amount field structure: dump distinct key-sets seen in f18 submessages
keysets=set()
cur.execute("SELECT Content FROM Objects WHERE CAST(ContentType AS TEXT)='79f99d26-e43a-4ecb-a9c9-0774601a9b2e'")
for (c,) in cur.fetchall():
    for ln in decode(c).get(11,[]):
        if isinstance(ln,dict) and "_msg" in ln:
            for a in ln["_msg"].get(18,[]):
                if isinstance(a,dict) and "_msg" in a:
                    keysets.add(tuple(sorted(a["_msg"].keys())))
print("\namount submsg keysets:", keysets)
con.close()
