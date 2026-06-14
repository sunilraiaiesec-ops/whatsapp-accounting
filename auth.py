import os
import secrets
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.responses import Response

DASHBOARD_PASSWORD = (os.environ.get("DASHBOARD_PASSWORD") or "").strip()
SESSION_SECRET = (os.environ.get("SESSION_SECRET") or "").strip() or "dev-insecure-change-me"


def auth_enabled() -> bool:
    return bool(DASHBOARD_PASSWORD)


def is_public_path(path: str, method: str) -> bool:
    if path == "/" or path == "/login":
        return True
    if path == "/logout":
        return True
    if path.startswith("/webhook/"):
        return True
    if method == "POST" and path == "/login":
        return True
    return False


def is_authenticated(request: Request) -> bool:
    if not auth_enabled():
        return True
    return bool(request.session.get("authenticated"))


def verify_password(password: str) -> bool:
    if not DASHBOARD_PASSWORD:
        return False
    return secrets.compare_digest(password, DASHBOARD_PASSWORD)


def auth_redirect(request: Request) -> Response:
    next_path = request.url.path
    if request.url.query:
        next_path = f"{next_path}?{request.url.query}"
    return RedirectResponse(url=f"/login?next={next_path}", status_code=302)


async def require_dashboard_auth(request: Request, call_next) -> Response:
    if not auth_enabled() or is_public_path(request.url.path, request.method):
        return await call_next(request)

    if is_authenticated(request):
        return await call_next(request)

    accept = request.headers.get("accept", "")
    if request.url.path.startswith("/api/") or "application/json" in accept:
        return JSONResponse(status_code=401, content={"detail": "Login required"})

    return auth_redirect(request)
