import asyncio
import hmac
import json
import os
import secrets

from fastapi import APIRouter, HTTPException, Request, WebSocket

HEADER = "x-formvis-window-key"
STDOUT_ENV = "FORMVIS_WINDOW_KEY_STDOUT"
LINE = "formvis-window-key: "
REFUSED = "Only the formvis window can do this"
READS = ("GET", "HEAD", "OPTIONS")
OPEN = ("/mcp", "/api/window/key", "/api/merge/panorama", "/api/merge/hdr")
SOCKET_WAIT = 5.0
KEY = secrets.token_urlsafe(32)
STATE = {"claimed": False, "secondClaim": False}

router = APIRouter(prefix="/api/window", tags=["window"])


def stdout_mode() -> bool:
    return os.environ.get(STDOUT_ENV) == "1"


def valid(value) -> bool:
    return isinstance(value, str) and bool(value) and hmac.compare_digest(value.encode("utf-8"), KEY.encode("utf-8"))


def held(request: Request) -> bool:
    return valid(request.headers.get(HEADER))


def require(request: Request) -> None:
    if not held(request):
        raise HTTPException(403, REFUSED)


def claim() -> str | None:
    if STATE["claimed"]:
        STATE["secondClaim"] = True
        return None
    STATE["claimed"] = True
    return KEY


async def socket_admitted(ws: WebSocket) -> bool:
    """A socket the page opened sends {"type": "key", "key": ...} first (a browser cannot set headers on a WebSocket)."""
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=SOCKET_WAIT))
    except Exception:
        return False
    return isinstance(first, dict) and first.get("type") == "key" and valid(first.get("key"))


@router.post("/key")
def claim_key() -> dict:
    if stdout_mode():
        raise HTTPException(404, "Not Found")
    key = claim()
    if key is None:
        raise HTTPException(409, "The window key was already given to a window of this engine.")
    return {"key": key}


@router.get("/key")
def key_state() -> dict:
    return {"claimed": STATE["claimed"], "secondClaim": STATE["secondClaim"], "packaged": stdout_mode()}


class WindowKeyGuard:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope.get("method") in READS or str(scope.get("path", "")) in OPEN:
            await self.app(scope, receive, send)
            return
        given = next((v.decode("latin-1") for k, v in scope.get("headers", []) if k.decode("latin-1").lower() == HEADER), None)
        if valid(given):
            await self.app(scope, receive, send)
            return
        body = json.dumps({"detail": REFUSED}).encode("utf-8")
        await send({"type": "http.response.start", "status": 403, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
