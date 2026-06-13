from parser import parse_message, transaction_status


def test_expense_paid_to():
    result = parse_message("Paid Ahmed 50000 FCFA transport")
    assert result["type"] == "expense"
    assert result["party"] == "Ahmed"
    assert result["amount"] == 50000
    assert result["currency"] == "FCFA"
    assert result["category"] == "transport"
    assert transaction_status(result) == "confirmed"


def test_receipt_received_from():
    result = parse_message("Received from Jean 120000 FCFA")
    assert result["type"] == "receipt"
    assert result["party"] == "Jean"
    assert result["amount"] == 120000
    assert transaction_status(result) == "confirmed"


def test_hindi_expense_ko_diye():
    result = parse_message("Ahmed ko 50000 diye loading")
    assert result["type"] == "expense"
    assert result["party"] == "Ahmed"
    assert result["amount"] == 50000
    assert result["category"] == "loading"
    assert transaction_status(result) == "confirmed"


def test_unknown_message_pending_review():
    result = parse_message("good morning team")
    assert result["type"] == "unknown"
    assert transaction_status(result) == "pending_review"


def test_received_million_multiword_party():
    result = parse_message("received 20 million from Elhaji Saidou")
    assert result["type"] == "receipt"
    assert result["party"] == "Elhaji Saidou"
    assert result["amount"] == 20_000_000
    assert transaction_status(result) == "confirmed"


def test_missing_amount_pending_review():
    result = parse_message("Paid Ahmed for transport")
    assert result["type"] == "expense"
    assert result["amount"] is None
    assert transaction_status(result) == "pending_review"
