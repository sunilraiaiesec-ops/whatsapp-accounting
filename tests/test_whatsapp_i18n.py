from whatsapp_i18n import detect_language_from_greeting
from whatsapp_prompts import active_prompts, format_ask_pin, format_saved, set_prompt_lang


def test_bonjour_selects_french():
    assert detect_language_from_greeting("Bonjour") == "fr"
    assert detect_language_from_greeting("Salut!") == "fr"


def test_hello_hi_selects_english():
    assert detect_language_from_greeting("Hello") == "en"
    assert detect_language_from_greeting("Hi there") == "en"


def test_french_pin_and_saved_messages():
    set_prompt_lang("fr")
    pin = format_ask_pin("Jean", "RR Foods SARL")
    assert "Bonjour Jean" in pin
    assert "bienvenue" in pin
    saved = format_saved("RR-000001", "Résumé", "Jean")
    assert "Transaction enregistrée dans le système" in saved
    assert "RR-000001" in saved


def test_english_saved_confirmation():
    set_prompt_lang("en")
    saved = format_saved("RR-000001", "Summary", "Kumar")
    assert "Transaction added to the system" in saved
    assert "RR-000001" in saved


def test_french_master_menu():
    set_prompt_lang("fr")
    menu = active_prompts().format_master_menu("Jean")
    assert "Encaissement" in menu
    assert "Que voulez-vous faire" in menu
