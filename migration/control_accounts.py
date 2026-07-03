"""Identify Manager built-in control-account GUIDs by usage + context."""
from __future__ import annotations
import sys
from collections import defaultdict
from manager_lib import load_objects, guid_of, amount_of, first_str

objs = load_objects(sys.argv[1])
print("d1489e95 in objects?", "d1489e95-bb28-4f5d-b42e-67d3291b3893" in objs)
print("dac7ba37 in objects?", "dac7ba37-0ccd-45e5-906e-548e6c50df37" in objs)

# Tally control-account GUIDs separately for Payments vs Receipts.
for doctype in ("Payment", "Receipt"):
    stats = defaultdict(lambda: {"n": 0, "amt": 0, "ctx": defaultdict(int)})
    for k, o in objs.items():
        if o["type"] != doctype:
            continue
        for ln in o["d"].get(11, []):
            if not (isinstance(ln, dict) and "_msg" in ln):
                continue
            m = ln["_msg"]
            acct = next((guid_of(v) for v in m.get(2, []) if guid_of(v)), None)
            amt = amount_of(m.get(18, [None])[0]) if m.get(18) else 0
            if acct and objs.get(acct) is None:
                s = stats[acct]; s["n"] += 1; s["amt"] += amt
                for f in (7, 8, 17):
                    for v in m.get(f, []):
                        g = guid_of(v)
                        if g and objs.get(g):
                            s["ctx"][objs[g]["type"]] += 1
    print(f"\n=== {doctype} control accounts ===")
    for g, s in sorted(stats.items(), key=lambda x: -x[1]["amt"])[:6]:
        print(f"  {g}  n={s['n']:5d}  amt={s['amt']:>16,}  ctx={dict(s['ctx'])}")

# Also: what do those line subfields (f7/f8/f17) reference? sample one big line
print("\nSample big unresolved-account lines (resolved subrefs):")
shown = 0
for k, o in objs.items():
    if o["type"] != "Payment" or shown >= 4:
        continue
    for ln in o["d"].get(11, []):
        if not (isinstance(ln, dict) and "_msg" in ln):
            continue
        m = ln["_msg"]
        acct = next((guid_of(v) for v in m.get(2, []) if guid_of(v)), None)
        amt = amount_of(m.get(18, [None])[0]) if m.get(18) else 0
        if acct and objs.get(acct) is None and amt > 5_000_000 and shown < 4:
            refs = {}
            for f in (7, 8, 17):
                for v in m.get(f, []):
                    g = guid_of(v)
                    if g:
                        refs[f] = f"{objs.get(g,{}).get('type','?')}:{first_str(objs.get(g,{}).get('d',{}),1,9,2,6,10)}"
            print(f"  amt={amt:,} memo={first_str(m,15)!r} subrefs={refs}")
            shown += 1
