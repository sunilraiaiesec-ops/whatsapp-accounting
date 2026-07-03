"""Validate: dateInt always even (=days*2); epoch from rent anchor; lag sanity."""
from __future__ import annotations
import datetime as dt, sys, sqlite3, statistics
from pbdecode import decode

DB = sys.argv[1]
NET = dt.datetime(1, 1, 1)
# Anchor: rent int=39492 == 2024-01-15  => epoch_ord = 738900 - 39492//2
EPOCH_ORD = dt.date(1970, 1, 1).toordinal()  # int = 2*(days since Unix epoch)
print("epoch:", dt.date.fromordinal(EPOCH_ORD), "(ordinal", EPOCH_ORD, ")")

DATE_FIELD = {
    "79f99d26-e43a-4ecb-a9c9-0774601a9b2e": 1,
    "7662b887-c8d8-486e-98fd-f9dbcd41c6dc": 1,
    "a0f6a539-f6a4-4a38-a69a-546a608a1f6d": 3,
    "dea4f923-c498-4504-b3ef-30be3c33175e": 1,
    "866217a4-f841-47de-a4e6-87152405c88d": 3,
}

def to_date(i): return dt.date.fromordinal(EPOCH_ORD + i // 2)

con = sqlite3.connect(DB); con.text_factory = bytes; cur = con.cursor()
cur.execute("SELECT CAST(ContentType AS TEXT), Content, Timestamp FROM Objects")
even = odd = 0
dates = []; lags = []
for ct, content, ts in cur.fetchall():
    ct = ct.decode()
    if ct not in DATE_FIELD or not content:
        continue
    for v in decode(content).get(DATE_FIELD[ct], []):
        if isinstance(v, dict) and "_msg" in v and 1 in v["_msg"] and isinstance(v["_msg"][1][0], int):
            i = v["_msg"][1][0]
            if i % 2 == 0: even += 1
            else: odd += 1
            d = to_date(i); dates.append(d)
            if ts:
                cre = (NET + dt.timedelta(seconds=ts/1e7)).date()
                lags.append((cre - d).days)
            break
con.close()

print(f"parity: even={even} odd={odd}  ({'ALL EVEN -> days*2 confirmed' if odd==0 else 'mixed'})")
dates.sort()
print("transaction date range:", dates[0], "..", dates[-1])
from collections import Counter
yr = Counter(d.year for d in dates)
print("by year:", dict(sorted(yr.items())))
lags.sort()
if lags:
    print(f"entry lag (creation - txn) days: p5={lags[len(lags)//20]} "
          f"p50={lags[len(lags)//2]} p95={lags[len(lags)*19//20]} "
          f"(negative = postdated)")
