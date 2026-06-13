from deliveries import normalize_document_number


def test_normalize_document_number_strips_leading_zeros():
    assert normalize_document_number("000875") == "875"
    assert normalize_document_number("N° 000864") == "864"
    assert normalize_document_number(" 000875 ") == "875"


def test_normalize_document_number_empty():
    assert normalize_document_number(None) is None
    assert normalize_document_number("") is None
    assert normalize_document_number("  ") is None


def test_same_doc_different_format():
    assert normalize_document_number("000875") == normalize_document_number("875")
    assert normalize_document_number("Doc 000875") == normalize_document_number("000875")
