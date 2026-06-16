from parties import can_manage_parties, normalize_party_name
from whatsapp_parties import (
    ADD_NEW_CODE,
    BROWSE_ALL_CODE,
    NEXT_PAGE_CODE,
    PICKER_MODE_BROWSE,
    PICKER_MODE_SEARCH,
    PREV_PAGE_CODE,
    _score_party_match,
    format_party_picker_message,
    format_party_search_prompt,
    format_party_search_results,
    get_party_page,
    parse_party_picker_input,
    search_parties,
)
from whatsapp_prompts import active_prompts, set_prompt_lang


def test_can_manage_parties_owner():
    assert can_manage_parties({"name": "Kumar Sunil Rai", "role": "owner"}) is True


def test_can_manage_parties_govind():
    assert can_manage_parties({"name": "Govind", "role": "staff"}) is True


def test_can_manage_parties_vikash():
    assert can_manage_parties({"name": "Vikash Kumar", "role": "staff"}) is True


def test_can_manage_parties_denied():
    assert can_manage_parties({"name": "Ameet Kumar", "role": "warehouse"}) is False


def test_format_party_search_prompt():
    set_prompt_lang("en")
    msg = format_party_search_prompt(
        title="Who is the client?", admin_can_add=False, prompts=active_prompts()
    )
    assert "Type part of the name" in msg
    assert BROWSE_ALL_CODE in msg


def test_format_party_search_prompt_french():
    set_prompt_lang("fr")
    msg = format_party_search_prompt(
        title="Quel client?", admin_can_add=False, prompts=active_prompts()
    )
    assert "Tapez une partie du nom" in msg


def test_format_party_picker_empty_non_admin():
    msg = format_party_picker_message(
        title="Select client:",
        parties=[],
        page=0,
        total_pages=1,
        admin_can_add=False,
        prompts=active_prompts(),
    )
    assert "No names in the list yet" in msg
    assert "Govind, Vikash" in msg
    assert ADD_NEW_CODE not in msg


def test_format_party_search_results():
    msg = format_party_search_results(
        title="Client:",
        query="abesso",
        parties=[{"id": 1, "name": "ABESSO ISSA KOUSSERI", "party_type": "customer"}],
        admin_can_add=True,
        prompts=active_prompts(),
    )
    assert 'Matches for "abesso"' in msg
    assert "ABESSO ISSA KOUSSERI" in msg
    assert ADD_NEW_CODE in msg


def test_fuzzy_score_ibesso_matches_abesso():
    party = {"name": "ABESSO ISSA KOUSSERI", "party_type": "customer"}
    score = _score_party_match(
        normalize_party_name("ibesso"),
        ["ibesso"],
        party,
    )
    assert score >= 70


def test_fuzzy_score_abesso_issa():
    party = {"name": "ABESSO ISSA KOUSSERI", "party_type": "customer"}
    score = _score_party_match(
        normalize_party_name("abesso issa"),
        ["abesso", "issa"],
        party,
    )
    assert score >= 80


def test_search_parties_fuzzy(monkeypatch):
    parties = [
        {"id": 1, "name": "ABESSO ISSA KOUSSERI", "party_type": "customer"},
        {"id": 2, "name": "AHMED BLAMA", "party_type": "customer"},
        {"id": 3, "name": "HAYATOU NASSOURU (MAROUA)", "party_type": "customer"},
    ]

    monkeypatch.setattr("whatsapp_parties.list_parties_by_types", lambda *_args, **_kwargs: parties)

    ibesso = search_parties("ibesso", ("customer",))
    assert ibesso[0]["name"] == "ABESSO ISSA KOUSSERI"

    hayatou = search_parties("hayatu maroua", ("customer",))
    assert hayatou[0]["name"] == "HAYATOU NASSOURU (MAROUA)"


def test_parse_party_picker_search_action():
    action, value = parse_party_picker_input(
        "abesso issa",
        party_types=("customer",),
        mode=PICKER_MODE_SEARCH,
        page=0,
        search_results=[],
        admin_can_add=False,
    )
    assert action == "search"
    assert value == "abesso issa"


def test_parse_party_picker_browse_action():
    action, value = parse_party_picker_input(
        BROWSE_ALL_CODE,
        party_types=("customer",),
        mode=PICKER_MODE_SEARCH,
        page=0,
        search_results=[],
        admin_can_add=False,
    )
    assert action == "browse"
    assert value == 0


def test_parse_party_picker_select_from_search_results():
    results = [{"id": 1, "name": "ABESSO ISSA KOUSSERI", "party_type": "customer"}]
    action, value = parse_party_picker_input(
        "1",
        party_types=("customer",),
        mode=PICKER_MODE_SEARCH,
        page=0,
        search_results=results,
        admin_can_add=False,
    )
    assert action == "select"
    assert value["name"] == "ABESSO ISSA KOUSSERI"


def test_parse_party_picker_select_from_browse(monkeypatch):
    parties = [{"id": 1, "name": "Acme", "party_type": "customer"}]

    def fake_get_page(party_types, page=0):
        return parties, 0, 1

    monkeypatch.setattr("whatsapp_parties.get_party_page", fake_get_page)
    action, value = parse_party_picker_input(
        "1",
        party_types=("customer",),
        mode=PICKER_MODE_BROWSE,
        page=0,
        search_results=[],
        admin_can_add=False,
    )
    assert action == "select"
    assert value["name"] == "Acme"


def test_parse_party_picker_text_in_browse_is_search():
    action, value = parse_party_picker_input(
        "hayatou",
        party_types=("customer",),
        mode=PICKER_MODE_BROWSE,
        page=0,
        search_results=[],
        admin_can_add=False,
    )
    assert action == "search"
    assert value == "hayatou"


def test_parse_party_picker_add_new_requires_admin():
    action, _ = parse_party_picker_input(
        ADD_NEW_CODE,
        party_types=("customer",),
        mode=PICKER_MODE_SEARCH,
        page=0,
        search_results=[],
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
        mode=PICKER_MODE_BROWSE,
        page=0,
        search_results=[],
        admin_can_add=False,
    )
    assert action == "page"
    assert value == 1

    action, value = parse_party_picker_input(
        PREV_PAGE_CODE,
        party_types=("customer",),
        mode=PICKER_MODE_BROWSE,
        page=1,
        search_results=[],
        admin_can_add=False,
    )
    assert action == "page"
    assert value == 0


def test_get_party_page_empty():
    parties, page, total_pages = get_party_page(("customer",), page=0)
    assert parties == []
    assert page == 0
    assert total_pages == 1
