"""Decide the date epoch: compare years mentioned in memos vs decoded dates."""
from __future__ import annotations
import datetime as dt, re, sys, sqlite3
from collections import Counter
from pbdecode import decode

DB = sys.argv[1]
OA = dt.date(1899, 12, 30)
YEAR = re.compile(r"\b(19[7-9]\d|20[0-3]\d)\b")

con = sqlite3.connect(DB); con.text_factory = bytes; cur = con.cursor()
cur.execute("SELECT Content, Timestamp FROM Objects")
rows = cur.fetchall(); con.close()

memo_years = Counter()
date_years = Counter()       # from OA epoch
ts_years = Counter()         # object creation (.NET ticks epoch 0001-01-01)


def collect(d):
    for f, vals in d.items():
        for v in vals:
            if isinstance(v, str):
                for y in YEAR.findall(v):
                    memo_years[int(y)] += 1
            elif isinstance(v, dict) and "_msg" in v:
                m = v["_msg"]
                # date-like: single int field that converts to a sane year
                if list(m.keys()) == [1] and isinstance(m[1][0], int):
                    n = m[1][0]
                    if 30000 < n < 60000:  # plausible day-count
                        try:
                            date_years[(OA + dt.timedelta(days=n)).year] += 1
                        except Exception:
                            pass
                else:
                    collect(m)


for content, ts in rows:
    if content:
        try:
            collect(decode(content))
        except Exception:
            pass
    if ts and isinstance(ts, int) and ts > 0:
        try:
            ts_years[(dt.datetime(1, 1, 1) + dt.timedelta(seconds=ts / 1e7)).year] += 1
        except Exception:
            pass

print("YEARS MENTIONED IN MEMOS (text):")
for y, c in sorted(memo_years.items()):
    print(f"  {y}: {c}")
print("\nTRANSACTION YEARS (date field via Excel/OA epoch 1899-12-30):")
for y, c in sorted(date_years.items()):
    print(f"  {y}: {c}")
print("\nOBJECT CREATION YEARS (.NET Timestamp):")
for y, c in sorted(ts_years.items()):
    print(f"  {y}: {c}")

# If memos say ~2024 but OA-dates say ~2008, suggest shift.
if date_years and memo_years:
    md = max(date_years, key=date_years.get)
    mm = max(memo_years, key=memo_years.get)
    print(f"\nMost common: dateField(OA)={md}  memoYear={mm}  shift={mm-md} years")
