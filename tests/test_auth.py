import os

os.environ["DASHBOARD_PASSWORD"] = "test-password"

from auth import auth_enabled, is_public_path, verify_password


def test_auth_enabled_when_password_set():
    assert auth_enabled() is True


def test_verify_password():
    assert verify_password("test-password") is True
    assert verify_password("wrong") is False


def test_public_paths():
    assert is_public_path("/", "GET") is True
    assert is_public_path("/webhook/whatsapp", "POST") is True
    assert is_public_path("/dashboard", "GET") is False
