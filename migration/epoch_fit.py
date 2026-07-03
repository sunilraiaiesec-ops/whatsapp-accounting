"""Recover the date epoch/scale by fitting date-field ints to creation times."""
from __future__ import annotations
import datetime as dt, re, sys, sqlite3
from pbdecode import decode

DB = sys.argv[1]
NET = dt.datetime(1, 1, 1)
YEAR = re.compile(r"\b(20[2-3]\d)\b")

# (content-type, date-field-number) for the real transaction date per doc type
DATE_FIELD = {
    "79f99d26-e43a-4ecb-a9c9-0774601a9b2e": 1,   # payments
    "7662b887-c8d8-486e-98fd-f9dbcd41c6dc": 1,   # receipts
    "a0f6a539-f6a4-4a38-a69a-546a608a1f6d": 3,   # sales invoices
    "dea4f923-c498-4504-b3ef-30be3c33175e": 1,   # transfers
}

con = sqlite3.connect(DB); con.text_factory = bytes; cur = con.cursor()
cur.execute("SELECT CAST(ContentType AS TEXT), Content, Timestamp FROM Objects")
pairs = []   # (dateInt, creation_ordinal)
samples = [] # (dateInt, memo_year, creation_date)
for ct, content, ts in cur.fetchall():
    ct = ct.decode()
    if ct not in DATE_FIELD or not content:
        continue
    d = decode(content)
    fld = DATE_FIELD[ct]
    di = None
    for v in d.get(fld, []):
        if isinstance(v, dict) and "_msg" in v:
            m = v["_msg"]
            if 1 in m and isinstance(m[1][0], int):
                di = m[1][0]; break
    if di is None:
        continue
    cre = NET + dt.timedelta(seconds=ts / 1e7) if ts else None
    pairs.append((di, cre.toordinal() if cre else None))
    # collect a few with explicit recent year in memo
    if len(samples) < 12:
        txt = " ".join(s for vs in d.values() for s in vs if isinstance(s, str))
        ys = YEAR.findall(txt)
        if ys:
            samples.append((di, ys, cre.date() if cre else None))
con.close()

ints = sorted(p[0] for p in pairs)
print(f"date-field ints: n={len(ints)} min={ints[0]} max={ints[-1]} "
      f"p5={ints[len(ints)//20]} p50={ints[len(ints)//2]} p95={ints[len(ints)*19//20]}")

cre = sorted(p[1] for p in pairs if p[1])
print("creation dates:", dt.date.fromordinal(cre[0]), "..", dt.date.fromordinal(cre[-1]),
      " p50=", dt.date.fromordinal(cre[len(cre)//2]))

# Robust linear fit: map int percentiles to creation percentiles.
def pct(a, q): return a[min(len(a)-1, max(0, int(len(a)*q)))]
i5, i95 = pct(ints, 0.05), pct(ints, 0.95)
c5, c95 = pct(cre, 0.05), pct(cre, 0.95)
scale = (c95 - c5) / (i95 - i5)
print(f"\nfitted scale = {scale:.5f} days per unit (≈1.0 means unit is days)")
def to_date(i): return dt.date.fromordinal(round(c5 + (i - i5) * scale))
print("fit -> min:", to_date(ints[0]), " max:", to_date(ints[-1]))

# Test a clean 'days' epoch too: epoch = creation - int assuming scale 1.
diffs = sorted(p[1] - p[0] for p in pairs if p[1])
emed = diffs[len(diffs)//2]
print(f"\nif unit=days: median epoch ordinal = {emed} -> {dt.date.fromordinal(emed)}")
print("  => min:", dt.date.fromordinal(emed+ints[0]), " max:", dt.date.fromordinal(emed+ints[-1]))

print("\nsamples (dateInt, memoYears, creationDate):")
for s in samples:
    print("  ", s, " days-epoch->", dt.date.fromordinal(emed + s[0]))
