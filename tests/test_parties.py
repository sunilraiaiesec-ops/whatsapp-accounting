from parties import infer_party_type, normalize_party_name


def test_normalize_party_name_matches_case_and_spacing():
    assert normalize_party_name("YERIMA HAYATOU") == normalize_party_name("yerima hayatou")
    assert normalize_party_name("  COPAL   SARL ") == "copal sarl"


def test_infer_party_type():
    assert infer_party_type("receipt") == "customer"
    assert infer_party_type("expense") == "supplier"
    assert infer_party_type(is_delivery_client=True) == "customer"
