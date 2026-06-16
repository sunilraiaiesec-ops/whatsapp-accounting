"""Predefined client/supplier pickers for WhatsApp flows."""

from __future__ import annotations

from typing import Any, Optional

from parties import (
    CUSTOMER_PARTY_TYPES,
    EXPENSE_PARTY_TYPES,
    SUPPLIER_PARTY_TYPES,
    can_manage_parties,
    create_party_record,
    list_parties_by_types,
)

PARTIES_PER_PAGE = 12
ADD_NEW_CODE = "99"
NEXT_PAGE_CODE = "98"
PREV_PAGE_CODE = "97"


def _party_type_label(party_type: str) -> str:
    labels = {
        "customer": "Client",
        "supplier": "Supplier",
        "facility": "Facility",
        "both": "Client/Supplier",
    }
    return labels.get(party_type, party_type.title())


def format_party_picker_message(
    *,
    title: str,
    parties: list[dict[str, Any]],
    page: int,
    total_pages: int,
    admin_can_add: bool,
) -> str:
    lines = [title, ""]
    if not parties and page == 0:
        lines.append("No names in the list yet.")
        if admin_can_add:
            lines.append("Reply 99 to add the first one.")
        else:
            lines.append("Ask Govind, Vikash, or an owner to add clients/suppliers.")
        return "\n".join(lines)

    start_index = page * PARTIES_PER_PAGE
    for offset, party in enumerate(parties):
        lines.append(f"{offset + 1}. {party['name']}")

    lines.append("")
    nav: list[str] = []
    if page > 0:
        nav.append(f"{PREV_PAGE_CODE} — Previous page")
    if page + 1 < total_pages:
        nav.append(f"{NEXT_PAGE_CODE} — Next page")
    if nav:
        lines.extend(nav)
    if admin_can_add:
        lines.append(f"{ADD_NEW_CODE} — ➕ Add new (admin)")
    lines.append("")
    lines.append("Reply with the number.")
    return "\n".join(lines)


def get_party_page(
    party_types: tuple[str, ...],
    page: int = 0,
) -> tuple[list[dict[str, Any]], int, int]:
    all_parties = list_parties_by_types(party_types)
    total = len(all_parties)
    if total == 0:
        return [], 0, 1
    total_pages = max(1, (total + PARTIES_PER_PAGE - 1) // PARTIES_PER_PAGE)
    page = max(0, min(page, total_pages - 1))
    start = page * PARTIES_PER_PAGE
    end = start + PARTIES_PER_PAGE
    return all_parties[start:end], page, total_pages


def parse_party_picker_input(
    text: str,
    *,
    party_types: tuple[str, ...],
    page: int,
    admin_can_add: bool,
) -> tuple[str, Optional[Any]]:
    """
    Returns (action, value):
      - ("select", party_dict)
      - ("add_new", None)
      - ("page", new_page_int)
      - ("invalid", None)
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return "invalid", None

    if cleaned == ADD_NEW_CODE:
        if admin_can_add:
            return "add_new", None
        return "invalid", None

    if cleaned == NEXT_PAGE_CODE:
        _, _, total_pages = get_party_page(party_types, page)
        if page + 1 < total_pages:
            return "page", page + 1
        return "invalid", None

    if cleaned == PREV_PAGE_CODE:
        if page > 0:
            return "page", page - 1
        return "invalid", None

    if not cleaned.isdigit():
        return "invalid", None

    index = int(cleaned)
    parties, _, _ = get_party_page(party_types, page)
    if index < 1 or index > len(parties):
        return "invalid", None
    return "select", parties[index - 1]


def create_party(name: str, party_type: str) -> Optional[dict[str, Any]]:
    return create_party_record(name, party_type)
