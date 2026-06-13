import re


def parse_message(message: str) -> dict:
    message = message.strip()
    lower_message = message.lower()

    amount_match = re.search(r"(\d[\d,]*)", message)
    amount = None
    if amount_match:
        amount = int(amount_match.group(1).replace(",", ""))

    currency = "FCFA" if "fcfa" in lower_message or "cfa" in lower_message else None

    transaction_type = "unknown"
    party = None
    category = None

    if "received from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(r"received from\s+([A-Za-z]+)", message, re.IGNORECASE)
        if party_match:
            party = party_match.group(1).strip()

    elif lower_message.startswith("received") and "from" in lower_message:
        transaction_type = "receipt"
        party_match = re.search(r"from\s+([A-Za-z]+)", message, re.IGNORECASE)
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
