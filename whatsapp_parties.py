"""Predefined client/supplier pickers for WhatsApp flows."""

from __future__ import annotations

import difflib
import re
from typing import TYPE_CHECKING, Any, Optional

from parties import (
    create_party_record,
    list_parties_by_types,
    normalize_party_name,
)

if TYPE_CHECKING:
    from whatsapp_i18n import PromptBundle

PARTIES_PER_PAGE = 12
SEARCH_RESULT_LIMIT = 8
MIN_SEARCH_SCORE = 38.0

ADD_NEW_CODE = "99"
BROWSE_ALL_CODE = "96"
NEXT_PAGE_CODE = "98"
PREV_PAGE_CODE = "97"

PICKER_MODE_SEARCH = "search"
PICKER_MODE_BROWSE = "browse"


def _tokenize_for_search(text: str) -> list[str]:
    norm = normalize_party_name(text)
    tokens = re.split(r"[^\w]+", norm)
    return [token for token in tokens if len(token) >= 2]


def _score_party_match(query_norm: str, query_tokens: list[str], party: dict[str, Any]) -> float:
    name_norm = normalize_party_name(party["name"])
    if not query_norm and not query_tokens:
        return 0.0
    if query_norm and query_norm == name_norm:
        return 100.0
    if query_norm and query_norm in name_norm:
        return 95.0

    score = difflib.SequenceMatcher(None, query_norm, name_norm).ratio() * 100
    name_parts = [part for part in re.split(r"[^\w]+", name_norm) if len(part) >= 2]
    if not query_tokens:
        return score

    token_ratios: list[float] = []
    for query_token in query_tokens:
        best = 0.0
        if query_token in name_norm:
            best = 1.0
        else:
            for part in name_parts:
                if len(part) >= 3 and (query_token in part or part in query_token):
                    best = max(best, 0.95)
                best = max(best, difflib.SequenceMatcher(None, query_token, part).ratio())
            if len(query_token) >= 3:
                for index in range(len(name_norm) - len(query_token) + 1):
                    chunk = name_norm[index : index + len(query_token)]
                    best = max(best, difflib.SequenceMatcher(None, query_token, chunk).ratio())
        token_ratios.append(best)

    best_token = max(token_ratios) * 100
    if len(query_tokens) == 1:
        score = max(score, best_token)
    else:
        avg_tokens = sum(token_ratios) / len(token_ratios) * 100
        min_token = min(token_ratios) * 100
        blended = avg_tokens * 0.35 + best_token * 0.65
        if min_token < 45:
            blended = best_token * 0.8 + avg_tokens * 0.2
        score = max(score, blended)

    return score


def search_parties(
    query: str,
    party_types: tuple[str, ...],
    *,
    limit: int = SEARCH_RESULT_LIMIT,
    min_score: float = MIN_SEARCH_SCORE,
) -> list[dict[str, Any]]:
    query_norm = normalize_party_name(query)
    query_tokens = _tokenize_for_search(query)
    if not query_norm and not query_tokens:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for party in list_parties_by_types(party_types):
        match_score = _score_party_match(query_norm, query_tokens, party)
        if match_score >= min_score:
            scored.append((match_score, party))

    scored.sort(key=lambda item: (-item[0], item[1]["name"]))
    return [party for _, party in scored[:limit]]


def format_party_search_prompt(
    *,
    title: str,
    admin_can_add: bool,
    prompts: "PromptBundle",
) -> str:
    lines = [title, "", prompts.party_search_hint, "", f"{BROWSE_ALL_CODE} — {prompts.party_browse_label}"]
    if admin_can_add:
        lines.append(f"{ADD_NEW_CODE} — {prompts.party_add_new}")
    lines.extend(["", prompts.party_search_footer])
    return "\n".join(lines)


def format_party_search_results(
    *,
    title: str,
    query: str,
    parties: list[dict[str, Any]],
    admin_can_add: bool,
    prompts: "PromptBundle",
) -> str:
    lines = [title, "", prompts.party_matches_for.format(query=query), ""]
    for offset, party in enumerate(parties):
        lines.append(f"{offset + 1}. {party['name']}")
    lines.extend(["", prompts.party_refine, f"{BROWSE_ALL_CODE} — {prompts.party_browse_label}"])
    if admin_can_add:
        lines.append(f"{ADD_NEW_CODE} — {prompts.party_add_new}")
    return "\n".join(lines)


def format_party_no_matches(*, query: str, admin_can_add: bool, prompts: "PromptBundle") -> str:
    lines = [
        prompts.party_no_match.format(query=query),
        "",
        prompts.party_no_match_hint,
        "",
        f"{BROWSE_ALL_CODE} — {prompts.party_browse_label}",
    ]
    if admin_can_add:
        lines.append(f"{ADD_NEW_CODE} — {prompts.party_add_new}")
    return "\n".join(lines)


def format_party_picker_message(
    *,
    title: str,
    parties: list[dict[str, Any]],
    page: int,
    total_pages: int,
    admin_can_add: bool,
    prompts: "PromptBundle",
) -> str:
    lines = [title, "", prompts.party_browse_title, ""]
    if not parties and page == 0:
        lines.append(prompts.party_empty_list)
        if admin_can_add:
            lines.append(f"Reply {ADD_NEW_CODE} to add the first one.")
        else:
            lines.append(prompts.party_empty_non_admin)
        return "\n".join(lines)

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
    lines.append(prompts.party_browse_footer)
    if admin_can_add:
        lines.append(f"{ADD_NEW_CODE} — {prompts.party_add_new}")
    lines.extend(["", prompts.party_reply_number])
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
    mode: str,
    page: int,
    search_results: Optional[list[dict[str, Any]]] = None,
    admin_can_add: bool,
) -> tuple[str, Optional[Any]]:
    """
    Returns (action, value):
      - ("select", party_dict)
      - ("search", query_str)
      - ("browse", page_int)
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

    if cleaned == BROWSE_ALL_CODE:
        return "browse", 0

    if mode == PICKER_MODE_BROWSE:
        if cleaned == NEXT_PAGE_CODE:
            _, _, total_pages = get_party_page(party_types, page)
            if page + 1 < total_pages:
                return "page", page + 1
            return "invalid", None
        if cleaned == PREV_PAGE_CODE:
            if page > 0:
                return "page", page - 1
            return "invalid", None

    if cleaned.isdigit():
        index = int(cleaned)
        if mode == PICKER_MODE_BROWSE:
            parties, _, _ = get_party_page(party_types, page)
            if 1 <= index <= len(parties):
                return "select", parties[index - 1]
            return "invalid", None

        results = search_results or []
        if results and 1 <= index <= len(results):
            return "select", results[index - 1]
        return "invalid", None

    if len(cleaned) < 2:
        return "invalid", None

    return "search", cleaned


def create_party(name: str, party_type: str) -> Optional[dict[str, Any]]:
    return create_party_record(name, party_type)
