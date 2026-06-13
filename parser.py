import re
from typing import Optional

MULTIPLIERS = {
    "k": 1_000,
    "m": 1_000_000,
    "million": 1_000_000,
    "millions": 1_000_000,
    "billion": 1_000_000_000,
    "billions": 1_000_000_000,
    "lakh": 100_000,
    "lakhs": 100_000,
    "lac": 100_000,
    "lacs": 100_000,
}


NAME_PATTERN = r"[\w\s.'-]+"


def parse_amount(message: str) -> Optional[int]:
    lower_message = message.lower().replace("million", " million ").replace("millions", " millions ")
    lower_message = re.sub(r"\s+", " ", lower_message).strip()

    scaled_match = re.search(
        r"(\d[\d,]*)\s*(k|m|million|millions|billion|billions|lakh|lakhs|lac|lacs)\b",
        lower_message,
    )
    if scaled_match:
        base = int(scaled_match.group(1).replace(",", ""))
        multiplier = MULTIPLIERS[scaled_match.group(2)]
        return base * multiplier

    amount_match = re.search(r"(\d[\d,]*)", message)
    if amount_match:
        return int(amount_match.group(1).replace(",", ""))

    return None


def parse_message(message: str) -> dict:
    message = message.strip()
    lower_message = message.lower()

    amount = parse_amount(message)

    currency = "FCFA" if "fcfa" in lower_message or "cfa" in lower_message else None

    transaction_type = "unknown"
    party = None
    category = None

    if "received from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(
            rf"received from\s+({NAME_PATTERN})$", message, re.IGNORECASE | re.UNICODE
        )
        if party_match:
            party = party_match.group(1).strip()

    elif lower_message.startswith("received") and "from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(
            rf"from\s+({NAME_PATTERN})$", message, re.IGNORECASE | re.UNICODE
        )
        if party_match:
            party = party_match.group(1).strip()

    elif re.search(r"\bse\b", lower_message) and (
        re.search(r"\bliye\b", lower_message)
        or re.search(r"\bliya\b", lower_message)
        or re.search(r"\blia\b", lower_message)
        or re.search(r"\bli\b", lower_message)
        or re.search(r"\bmila\b", lower_message)
        or re.search(r"\bmile\b", lower_message)
        or re.search(r"\breceived\b", lower_message)
    ):
        transaction_type = "receipt"
        party_match = re.search(r"^([A-Za-z\s]+?)\s+se\b", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip().title()

    elif "paid" in lower_message:
        transaction_type = "expense"
        party_match = re.search(
            r"\bto\s+([A-Za-z][A-Za-z\s]+?)(?:\s+for\s+|$)", message, re.IGNORECASE
        )
        if party_match:
            party = party_match.group(1).strip()
        else:
            party_match = re.search(r"paid\s+([A-Za-z]+)", message, re.IGNORECASE)
            if party_match:
                party = party_match.group(1).strip()

    elif re.search(r"\bko\b", lower_message) and (
        re.search(r"\bdiye\b", lower_message)
        or re.search(r"\bdiya\b", lower_message)
        or re.search(r"\bdia\b", lower_message)
        or re.search(r"\bdi\b", lower_message)
        or re.search(r"\bde diye\b", lower_message)
    ):
        transaction_type = "expense"
        party_match = re.search(r"^([A-Za-z\s]+?)\s+ko\b", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip().title()

    elif "sent" in lower_message:
        transaction_type = "expense"
        party_match = re.search(r"sent\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "gave" in lower_message:
        transaction_type = "expense"
        party_match = re.search(r"gave\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "give to" in lower_message:
        transaction_type = "payment"
        party_match = re.search(r"give to\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif "return to" in lower_message:
        transaction_type = "return_payment"
        party_match = re.search(r"return to\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    if "transport" in lower_message:
        category = "transport"
    elif "rent" in lower_message:
        category = "rent"
    elif "salary" in lower_message:
        category = "salary"
    elif "rice" in lower_message:
        category = "rice"
    elif "loading" in lower_message:
        category = "loading"
    elif "marketing" in lower_message or "pub" in lower_message:
        category = "marketing"
    elif "warehouse" in lower_message or "entrepot" in lower_message:
        category = "warehouse"

    return {
        "original_message": message,
        "type": transaction_type,
        "party": party,
        "amount": amount,
        "currency": currency,
        "category": category,
    }


def transaction_status(parsed: dict) -> str:
    if parsed["type"] == "unknown" or parsed["amount"] is None:
        return "pending_review"
    return "confirmed"
