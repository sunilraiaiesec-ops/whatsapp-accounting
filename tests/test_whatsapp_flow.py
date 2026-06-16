import os

os.environ["WHATSAPP_STAFF_PIN"] = "123456"

from whatsapp_flow import _menu_choices, _parse_amount, _parse_choice
from whatsapp_prompts import set_prompt_lang


def test_parse_amount():
    assert _parse_amount("50000") == 50000
    assert _parse_amount("50,000 FCFA") == 50000
    assert _parse_amount("hello") is None


def test_parse_choice():
    valid = {"1": "a", "2": "b"}
    assert _parse_choice("1", valid) == "1"
    assert _parse_choice("9", valid) is None


def test_menu_has_five_flows():
    set_prompt_lang("en")
    choices = _menu_choices()
    assert len(choices) == 5
    assert "1" in choices
    assert "5" in choices


def test_zero_at_proof_step_means_missing_paperwork_not_cancel():
    from whatsapp_flow import STEP_CR_PROOF, STEP_EX_PROOF, STEPS_WHERE_ZERO_IS_VALID

    assert STEP_CR_PROOF in STEPS_WHERE_ZERO_IS_VALID
    assert STEP_EX_PROOF in STEPS_WHERE_ZERO_IS_VALID


def test_flow_prompts_use_runtime_language():
    from whatsapp_prompts import set_prompt_lang, active_prompts

    set_prompt_lang("en")
    en_client = active_prompts().picker_client
    set_prompt_lang("fr")
    fr_client = active_prompts().picker_client
    assert en_client != fr_client
    assert "Quel est le client" in fr_client
