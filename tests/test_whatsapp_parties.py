from parties import can_manage_parties
from whatsapp_parties import (
    ADD_NEW_CODE,
    NEXT_PAGE_CODE,
    PREV_PAGE_CODE,
    format_party_picker_message,
    get_party_page,
    parse_party_picker_input,
)


def test_can_manage_parties_owner():
    assert can_manage_parties({"name": "Kumar Sunil Rai", "role": "owner"}) is True


def test_can_manage_parties_govind():
    assert can_manage_parties({"name": "Govind", "role": "staff"}) is True


def test_can_manage_parties_vikash():
    assert can_manage_parties({"name": "Vikash Kumar", "role": "staff"}) is True


def test_can_manage_parties_denied():
    assert can_manage_parties({"name": "Ameet Kumar", "role": "warehouse"}) is False


def test_format_party_picker_empty_non_admin():
    msg = format_party_picker_message(
        title="Select client:",
        parties=[],
        page=0,
        total_pages=1,
        admin_can_add=False,
    )
    assert "No names in the list yet" in msg
    assert "Govind, Vikash" in msg
    assert ADD_NEW_CODE not in msg


def test_format_party_picker_with_admin_add():
    msg = format_party_picker_message(
        title="Select client:",
        parties=[{"id": 1, "name": "Acme Ltd", "party_type": "customer"}],
        page=0,
        total_pages=1,
        admin_can_add=True,
    )
    assert "1. Acme Ltd" in msg
    assert ADD_NEW_CODE in msg


def test_parse_party_picker_select(monkeypatch):
    parties = [{"id": 1, "name": "Acme", "party_type": "customer"}]

    def fake_get_page(party_types, page=0):
        return parties, 0, 1

    monkeypatch.setattr("whatsapp_parties.get_party_page", fake_get_page)
    action, value = parse_party_picker_input(
        "1",
        party_types=("customer",),
        page=0,
        admin_can_add=False,
    )
    assert action == "select"
    assert value["name"] == "Acme"


def test_parse_party_picker_add_new_requires_admin():
    action, _ = parse_party_picker_input(
        ADD_NEW_CODE,
        party_types=("customer",),
        page=0,
        admin_can_add=False,
    )
    assert action == "invalid"


def test_parse_party_picker_pagination(monkeypatch):
    def fake_get_page(party_types, page=0):
        return [], page, 3

    monkeypatch.setattr("whatsapp_parties.get_party_page", fake_get_page)
    action, value = parse_party_picker_input(
        NEXT_PAGE_CODE,
        party_types=("customer",),
        page=0,
        admin_can_add=False,
    )
    assert action == "page"
    assert value == 1

    action, value = parse_party_picker_input(
        PREV_PAGE_CODE,
        party_types=("customer",),
        page=1,
        admin_can_add=False,
    )
    assert action == "page"
    assert value == 0


def test_get_party_page_empty():
    parties, page, total_pages = get_party_page(("customer",), page=0)
    assert parties == []
    assert page == 0
    assert total_pages == 1
