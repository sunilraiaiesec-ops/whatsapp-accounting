"""Find memos with explicit dates, pair with dateInt, solve epoch+scale."""
from __future__ import annotations
import datetime as dt, re, sys, sqlite3
from pbdecode import decode

DB = sys.argv[1]
MONTHS = {m: i+1 for i, m in enumerate(
    ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"])}
# e.g. "15 JAN 2024" or "15JAN2024"
PAT = re.compile(r"\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*(20[2-3]\d)\b")

DATE_FIELD = {
    "79f99d26-e43a-4ecb-a9c9-0774601a9b2e": 1,
    "7662b887-c8d8-486e-98fd-f9dbcd41c6dc": 1,
    "a0f6a539-f6a4-4a38-a69a-546a608a1f6d": 3,
    "dea4f923-c498-4504-b3ef-30be3c33175e": 1,
}
con = sqlite3.connect(DB); con.text_factory = bytes; cur = con.cursor()
cur.execute("SELECT CAST(ContentType AS TEXT), Content FROM Objects")
anchors = []
for ct, content in cur.fetchall():
    ct = ct.decode()
    if ct not in DATE_FIELD or not content:
        continue
    d = decode(content)
    di = None
    for v in d.get(DATE_FIELD[ct], []):
        if isinstance(v, dict) and "_msg" in v and 1 in v["_msg"] and isinstance(v["_msg"][1][0], int):
            di = v["_msg"][1][0]; break
    if di is None:
        continue
    txt = " ".join(s for vs in d.values() for s in vs if isinstance(s, str)).upper()
    m = PAT.search(txt)
    if m:
        day, mon, yr = int(m.group(1)), MONTHS[m.group(2)], int(m.group(3))
        try:
            target = dt.date(yr, mon, day)
            anchors.append((di, target, m.group(0)))
        except ValueError:
            pass
con.close()

anchors.sort()
print(f"found {len(anchors)} explicit-date anchors; showing spread:")
for a in anchors[:8] + anchors[-4:]:
    print("  int=", a[0], "memoDate=", a[1], "ord=", a[1].toordinal(), " '", a[2], "'")

# Solve scale & epoch via least squares: ordinal = epoch + scale*int
import statistics
xs = [a[0] for a in anchors]; ys = [a[1].toordinal() for a in anchors]
n = len(xs); mx = statistics.mean(xs); my = statistics.mean(ys)
sxy = sum((x-mx)*(y-my) for x, y in zip(xs, ys))
sxx = sum((x-mx)**2 for x in xs)
scale = sxy/sxx; epoch = my - scale*mx
print(f"\nleast-squares: scale={scale:.6f} days/unit, epoch_ordinal={epoch:.2f} "
      f"({dt.date.fromordinal(round(epoch))})")

# Test exact half-day model: ordinal = E + int/2
errs = [abs(a[1].toordinal() - (epoch + scale*a[0])) for a in anchors]
print(f"residual median={statistics.median(errs):.1f} days, max={max(errs):.0f} days")

# Candidate clean model: days = int/2 since some epoch. Solve epoch with scale=0.5
e_half = statistics.median(a[1].toordinal() - a[0]*0.5 for a in anchors)
errs2 = [abs(a[1].toordinal() - (e_half + 0.5*a[0])) for a in anchors]
print(f"half-day model: epoch={dt.date.fromordinal(round(e_half))} "
      f"residual median={statistics.median(errs2):.1f} max={max(errs2):.0f}")
