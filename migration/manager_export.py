"""Extract a Manager .manager backup into clean JSON + print a summary.

Usage:  python3 manager_export.py "/path/to/file.manager" [outdir]
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict

from manager_lib import (amount_of, first_str, guid_of, load_objects, to_date)

DB = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
os.makedirs(OUT, exist_ok=True)

objs = load_objects(DB)


def name(key):
    o = objs.get(key)
    if not o:
        return None
    d = o["d"]
    return first_str(d, 1, 9, 6, 2, 10)


def lines_of(d, field=11):
    out = []
    for ln in d.get(field, []):
        if isinstance(ln, dict) and "_msg" in ln:
            m = ln["_msg"]
            acct = None
            for v in m.get(2, []):
                g = guid_of(v)
                if g:
                    acct = g
                    break
            out.append({
                "account": acct,
                "accountName": name(acct) if acct else None,
                "memo": first_str(m, 15),
                "amount": amount_of(m.get(18, [None])[0]) if m.get(18) else 0,
            })
    return out


export = defaultdict(list)
for key, o in objs.items():
    t, d = o["type"], o["d"]
    if t == "Account":
        grp = next((guid_of(v) for v in d.get(3, []) if guid_of(v)), None)
        export["accounts"].append({
            "key": key, "name": first_str(d, 1), "group": name(grp)})
    elif t == "BankCashAccount":
        export["bank_cash_accounts"].append({
            "key": key, "name": first_str(d, 1), "number": first_str(d, 21)})
    elif t == "Customer":
        export["customers"].append({
            "key": key, "name": first_str(d, 1), "details": first_str(d, 2)})
    elif t == "Supplier":
        export["suppliers"].append({
            "key": key, "name": first_str(d, 1), "email": first_str(d, 2),
            "code": first_str(d, 10), "address": first_str(d, 7)})
    elif t == "InventoryItem":
        export["inventory_items"].append({
            "key": key, "code": first_str(d, 2), "name": first_str(d, 9)})
    elif t == "InventoryLocation":
        export["locations"].append({"key": key, "name": first_str(d, 1)})
    elif t == "Payment":
        cash = next((guid_of(v) for v in d.get(7, []) if guid_of(v)), None)
        ls = lines_of(d)
        export["payments"].append({
            "key": key, "date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
            "reference": first_str(d, 2), "payee": first_str(d, 6),
            "cashAccount": name(cash), "memo": first_str(d, 10),
            "total": sum(l["amount"] for l in ls), "lines": ls})
    elif t == "Receipt":
        cash = next((guid_of(v) for v in d.get(7, []) if guid_of(v)), None)
        party = next((guid_of(v) for v in d.get(4, []) if guid_of(v)), None)
        ls = lines_of(d)
        export["receipts"].append({
            "key": key, "date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
            "reference": first_str(d, 2), "party": name(party),
            "cashAccount": name(cash), "memo": first_str(d, 10),
            "total": sum(l["amount"] for l in ls), "lines": ls})
    elif t == "InterAccountTransfer":
        frm = next((guid_of(v) for v in d.get(2, []) if guid_of(v)), None)
        to = next((guid_of(v) for v in d.get(3, []) if guid_of(v)), None)
        export["transfers"].append({
            "key": key, "date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
            "from": name(frm), "to": name(to), "memo": first_str(d, 5),
            "reference": first_str(d, 6),
            "amount": amount_of(d.get(8, [None])[0]) if d.get(8) else 0})

for fn, rows in export.items():
    with open(os.path.join(OUT, f"{fn}.json"), "w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

# ---- Summary -------------------------------------------------------------
print("EXTRACTED:")
for fn in ["accounts", "bank_cash_accounts", "customers", "suppliers",
           "inventory_items", "locations", "payments", "receipts", "transfers"]:
    print(f"  {fn:20s} {len(export.get(fn, [])):6d}")

pay = sum(p["total"] for p in export["payments"])
rec = sum(r["total"] for r in export["receipts"])
print(f"\nTotal payments (money out): {pay:,} XAF")
print(f"Total receipts  (money in): {rec:,} XAF")
print(f"Net cash from receipts-payments: {rec - pay:,} XAF")

# Top expense accounts (by payment lines)
acc = defaultdict(int)
for p in export["payments"]:
    for l in p["lines"]:
        acc[l["accountName"]] += l["amount"]
print("\nTop 10 expense/payment accounts:")
for n, v in sorted(acc.items(), key=lambda x: -x[1])[:10]:
    print(f"  {v:>15,}  {n}")

print("\nSample payments:")
for p in sorted(export["payments"], key=lambda x: x["date"] or "")[:3]:
    print(f"  {p['date']}  {p['total']:>12,}  {p['payee']}")
print("Sample receipts:")
for r in sorted(export["receipts"], key=lambda x: x["date"] or "")[:3]:
    print(f"  {r['date']}  {r['total']:>12,}  {r['party']}")
