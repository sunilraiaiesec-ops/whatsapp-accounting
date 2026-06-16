from party_seeds import DEFAULT_CUSTOMER_NAMES, seed_default_customers


def test_default_customer_list_count():
    assert len(DEFAULT_CUSTOMER_NAMES) == 97


def test_default_customer_names_unique_when_normalized():
    from parties import normalize_party_name

    normalized = [normalize_party_name(name) for name in DEFAULT_CUSTOMER_NAMES]
    assert len(normalized) == len(set(normalized))


def test_seed_default_customers_is_callable():
    assert callable(seed_default_customers)
