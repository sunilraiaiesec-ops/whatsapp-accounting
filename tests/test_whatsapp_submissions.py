import json

from whatsapp_submissions import _json_safe


def test_json_safe_handles_flow_payload():
    payload = {
        "lang": "fr",
        "amount": 23000,
        "client": "TRADE VENTURES CHAD LTD SARL",
        "client_id": 2,
        "party_search_results": [{"id": 1, "name": "X", "party_type": "customer"}],
        "proof_skipped": True,
        "missing_paperwork_reason": "Il n'a pas sa carte d'identité",
    }
    safe = _json_safe(payload)
    assert json.loads(json.dumps(safe)) == safe
    assert safe["missing_paperwork_reason"] == "Il n'a pas sa carte d'identité"
