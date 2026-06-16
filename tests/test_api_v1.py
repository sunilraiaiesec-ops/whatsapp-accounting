import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DASHBOARD_PASSWORD", "test-api-password")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-api-v1-tests-only")

from main import app  # noqa: E402


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def authed_client(client):
    response = client.post(
        "/login",
        data={"password": "test-api-password", "next": "/dashboard"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    return client


def test_api_v1_requires_auth(client):
    response = client.get("/api/v1")
    assert response.status_code == 401
    assert response.json()["detail"] == "Login required"


def test_api_v1_index(authed_client):
    response = authed_client.get("/api/v1")
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 1
    assert "summary" in data["endpoints"]


def test_api_v1_summary(authed_client):
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")
    response = authed_client.get("/api/v1/summary")
    assert response.status_code == 200
    data = response.json()
    assert "cash" in data
    assert "review" in data
    assert "net_balance" in data["cash"]


def test_api_v1_monthly_report_bad_month(authed_client):
    response = authed_client.get("/api/v1/reports/monthly", params={"month": 13})
    assert response.status_code == 400
