from categories import resolve_category


class FakeCursor:
    def __init__(self, categories):
        self.categories = categories
        self.last_kind = None

    def execute(self, query, params):
        self.last_kind = params[1]

    def fetchall(self):
        return [
            {
                "id": idx + 1,
                "name": name,
                "slug": slug,
                "category_type": kind,
                "keywords": keywords,
                "sort_order": order,
            }
            for idx, (name, slug, kind, keywords, order) in enumerate(self.categories)
            if kind == self.last_kind
        ]


def test_resolve_transport_from_message():
    cats = [
        ("Transport", "transport", "expense", "transport,fuel", 10),
        ("Other expense", "other_expense", "expense", "", 900),
    ]
    cur = FakeCursor(cats)
    cat_id, name = resolve_category(
        cur, "Paid Ahmed 50000 FCFA transport", "expense", hint_slug=None
    )
    assert name == "Transport"
    assert cat_id == 1


def test_loading_hint_maps_to_warehouse():
    cats = [
        ("Warehouse", "warehouse", "expense", "warehouse,loading", 10),
        ("Other expense", "other_expense", "expense", "", 900),
    ]
    cur = FakeCursor(cats)
    cat_id, name = resolve_category(
        cur, "Paid team 20000 FCFA loading", "expense", hint_slug="loading"
    )
    assert name == "Warehouse"


def test_receipt_uses_income_categories():
    cats = [
        ("Sales", "sales", "income", "vente,sale", 10),
        ("Other income", "other_income", "income", "", 900),
    ]
    cur = FakeCursor(cats)
    cat_id, name = resolve_category(
        cur, "Received from Yerima 100000 FCFA", "receipt", hint_slug=None
    )
    assert name == "Other income"
