"""Build a single loader-oriented migration.json (GUID-keyed) for the TS loader.

Keeps Manager GUIDs so the TS side can map them to Bantoo account/party/item
ids. Money is integer XAF. Dates ISO. Control accounts flagged by constant GUID.
"""
from __future__ import annotations
import json, os, re, sys
from manager_lib import load_objects, guid_of, amount_of, num_of, to_date, first_str

DB = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
os.makedirs(OUT, exist_ok=True)

AR = "d1489e95-bb28-4f5d-b42e-67d3291b3893"   # Accounts receivable (built-in)
AP = "dac7ba37-0ccd-45e5-906e-548e6c50df37"   # Accounts payable (built-in)
EUR_XAF = 655.957                              # XAF is pegged to EUR
TONS = re.compile(r"([\d.,]+)\s*TON", re.I)

objs = load_objects(DB)
grpname = {k: first_str(o["d"], 1) for k, o in objs.items() if o["type"] == "AccountGroup"}


def acc_type(d):
    g = next((guid_of(v) for v in d.get(3, []) if guid_of(v)), None)
    return "INCOME" if (grpname.get(g) or "").strip().lower() == "income" else "EXPENSE"


def line_acct(m):
    return next((guid_of(v) for v in m.get(2, []) if guid_of(v)), None)


def line_party(m):
    for f in (7, 8):
        for v in m.get(f, []):
            g = guid_of(v)
            if g and objs.get(g, {}).get("type") in ("Supplier", "Customer"):
                return g
    return None


out = {
    "controlAccounts": {"receivable": AR, "payable": AP},
    "accounts": {}, "bankCash": {}, "parties": {}, "items": {},
    "receipts": [], "payments": [], "transfers": [],
    "salesInvoices": [], "purchaseInvoices": [],
}

for k, o in objs.items():
    t, d = o["type"], o["d"]
    if t == "Account":
        out["accounts"][k] = {"name": first_str(d, 1) or "Account", "type": acc_type(d)}
    elif t == "BankCashAccount":
        out["bankCash"][k] = {"name": first_str(d, 1) or "Account", "number": first_str(d, 21)}
    elif t == "Customer":
        out["parties"][k] = {"name": first_str(d, 1) or "Customer", "kind": "customer"}
    elif t == "Supplier":
        out["parties"][k] = {"name": first_str(d, 1) or "Supplier", "kind": "supplier"}
    elif t == "InventoryItem":
        out["items"][k] = {"code": first_str(d, 2) or k[:8], "name": first_str(d, 9) or "Item"}

for k, o in objs.items():
    t, d = o["type"], o["d"]
    if t == "Receipt":
        cash = next((guid_of(v) for v in d.get(7, []) if guid_of(v)), None)
        party = next((guid_of(v) for v in d.get(4, []) if guid_of(v)), None)
        lines = [{"acct": line_acct(m), "amount": amount_of(m.get(18, [None])[0]) if m.get(18) else 0,
                  "memo": first_str(m, 15), "party": line_party(m)}
                 for ln in d.get(11, []) if isinstance(ln, dict) and "_msg" in ln for m in [ln["_msg"]]]
        out["receipts"].append({"date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
                                "ref": first_str(d, 2), "party": party, "cash": cash,
                                "memo": first_str(d, 6, 10), "lines": [l for l in lines if l["amount"]]})
    elif t == "Payment":
        cash = next((guid_of(v) for v in d.get(7, []) if guid_of(v)), None)
        lines = [{"acct": line_acct(m), "amount": amount_of(m.get(18, [None])[0]) if m.get(18) else 0,
                  "memo": first_str(m, 15), "party": line_party(m)}
                 for ln in d.get(11, []) if isinstance(ln, dict) and "_msg" in ln for m in [ln["_msg"]]]
        out["payments"].append({"date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
                                "ref": first_str(d, 2), "payee": first_str(d, 6),
                                "cash": cash, "memo": first_str(d, 10),
                                "lines": [l for l in lines if l["amount"]]})
    elif t == "InterAccountTransfer":
        out["transfers"].append({"date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
                                 "from": next((guid_of(v) for v in d.get(2, []) if guid_of(v)), None),
                                 "to": next((guid_of(v) for v in d.get(3, []) if guid_of(v)), None),
                                 "amount": amount_of(d.get(8, [None])[0]) if d.get(8) else 0,
                                 "ref": first_str(d, 6), "memo": first_str(d, 5)})
    elif t == "SalesInvoice":
        cust = next((guid_of(v) for v in d.get(3, []) if guid_of(v)), None)
        lines = []
        for ln in d.get(49, []):
            if isinstance(ln, dict) and "_msg" in ln:
                m = ln["_msg"]
                qv = num_of(m.get(18, [None])[0]) if m.get(18) else 0
                pv = num_of(m.get(19, [None])[0]) if m.get(19) else 0
                if qv and pv:
                    lines.append({"desc": first_str(d, 12) or "Sale", "qty": qv,
                                  "unitPrice": pv, "lineTotal": int(round(qv * pv))})
        out["salesInvoices"].append({"date": to_date(d.get(1, [None])[0]) if d.get(1) else None,
                                     "number": first_str(d, 2), "customer": cust, "lines": lines})
    elif t == "PurchaseInvoice":
        sup = next((guid_of(v) for v in d.get(4, []) if guid_of(v)), None)
        desc = first_str(d, 6) or ""
        tons = None
        mt = TONS.search(desc)
        if mt:
            try:
                tons = float(mt.group(1).replace(",", ""))
            except ValueError:
                tons = None
        # EUR/MT custom field lives deep in f15[].f9
        eur = None
        for ln in d.get(15, []):
            if isinstance(ln, dict) and "_msg" in ln:
                for f9 in ln["_msg"].get(9, []):
                    try:
                        eur = f9["_msg"][2][0]["_msg"][2][0]["_msg"][1][0]
                    except Exception:
                        pass
        xaf = int(round(tons * eur * EUR_XAF)) if (tons and eur) else None
        out["purchaseInvoices"].append({"date": to_date(d.get(3, [None])[0]) if d.get(3) else None,
                                        "number": first_str(d, 1), "supplier": sup, "desc": desc,
                                        "tons": tons, "eurPerMT": eur, "xaf": xaf})

with open(os.path.join(OUT, "migration.json"), "w") as f:
    json.dump(out, f, ensure_ascii=False)

# Summary
print("accounts", len(out["accounts"]), "bankCash", len(out["bankCash"]),
      "parties", len(out["parties"]), "items", len(out["items"]))
for key in ("receipts", "payments", "transfers", "salesInvoices", "purchaseInvoices"):
    print(key, len(out[key]))
si = sum(l["lineTotal"] for s in out["salesInvoices"] for l in s["lines"])
pi_ok = [p for p in out["purchaseInvoices"] if p["xaf"]]
pi = sum(p["xaf"] for p in pi_ok)
print(f"sales invoices total: {si:,} XAF")
print(f"purchase invoices priced: {len(pi_ok)}/{len(out['purchaseInvoices'])} total {pi:,} XAF")
