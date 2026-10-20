"""Stands in for the frozen engine sidecar in the Linux desktop tests: the shell starts it, reads the address it prints, and
opens its window there. It serves a built frontend from a folder, passes every other request to the engine that is already
running (so no second engine is started), and answers the window's agent-bridge long poll itself, so a test drives only the
window the shell opened and never a browser another run has connected to the shared engine.

usage: engine_stub.py DIST_FOLDER [UPSTREAM_PORT]
Test control, on the stub's own address:
  POST /__stub/call   {"name": tool, "arguments": {...}, "timeout": seconds}  runs one bridge tool in the window, returns its result
  GET  /__stub/state  what the window has done so far: polls, catalogue size, requests seen
"""
import http.client
import json
import mimetypes
import os
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

DIST = Path(sys.argv[1]).resolve()
UPSTREAM = int(sys.argv[2]) if len(sys.argv) > 2 else 8190
SKIP = {"connection", "transfer-encoding", "keep-alive", "content-length", "server", "date"}

LOCK = threading.Condition()
PENDING: list = []
RESULTS: dict = {}
STATE = {"polls": 0, "last_poll": 0.0, "allowed": None, "catalogue": 0, "missing": [], "commands": [], "requests": []}


def note(method: str, path: str) -> None:
    with LOCK:
        STATE["requests"].append(f"{method} {path.split('?')[0]}")
        del STATE["requests"][:-400]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def _send(self, status: int, headers: list[tuple[str, str]], body: bytes) -> None:
        self.send_response(status)
        for key, value in headers:
            if key.lower() not in SKIP:
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, value, status: int = 200) -> None:
        self._send(status, [("Content-Type", "application/json")], json.dumps(value).encode())

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _static(self) -> bool:
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/api/") or path.startswith("/mcp") or path == "/health":
            return False
        target = (DIST / path.lstrip("/")).resolve()
        if target.is_dir():
            target = target / "index.html"
        if DIST not in target.parents or not target.is_file():
            return False
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        seeded = os.environ.get("FORMVIS_STUB_STORAGE")
        if target.name == "index.html":
            script = "<script>try{fetch('/__stub/report',{method:'POST',body:JSON.stringify({isolated:window.crossOriginIsolated===true,sab:typeof SharedArrayBuffer,cores:navigator.hardwareConcurrency,worker:typeof Worker,secure:window.isSecureContext,agent:navigator.userAgent})}).catch(()=>{})}catch(e){}</script>"
            if seeded:
                script += f"<script>try{{const s={seeded};for(const k in s)if(localStorage.getItem(k)===null)localStorage.setItem(k,s[k])}}catch(e){{}}</script>"
            data = data.replace(b"<head>", b"<head>" + script.encode(), 1)
        isolation = [] if os.environ.get("FORMVIS_ISOLATED") == "0" else [("Cross-Origin-Opener-Policy", "same-origin"), ("Cross-Origin-Embedder-Policy", os.environ.get("FORMVIS_STUB_COEP", "credentialless"))]
        self._send(200, [("Content-Type", kind), ("Cache-Control", "no-store"), *isolation], data)
        return True

    def _proxy(self, body: bytes) -> None:
        keep = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection", "content-length")}
        link = http.client.HTTPConnection("127.0.0.1", UPSTREAM, timeout=700)
        try:
            link.request(self.command, self.path, body=body or None, headers=keep)
            answer = link.getresponse()
            self._send(answer.status, answer.getheaders(), answer.read())
        except OSError as err:
            self._send(502, [("Content-Type", "text/plain")], str(err).encode())
        finally:
            link.close()

    def _next(self) -> None:
        allowed = "allowed=0" not in (urlsplit(self.path).query or "")
        deadline = time.monotonic() + 20
        with LOCK:
            STATE["polls"] += 1
            STATE["allowed"] = allowed
            while time.monotonic() < deadline:
                STATE["last_poll"] = time.time()
                if PENDING:
                    self._json(PENDING.pop(0))
                    return
                LOCK.wait(timeout=1.0)
        self._send(204, [], b"")

    def _call(self, body: bytes) -> None:
        ask = json.loads(body or b"{}")
        item = {"id": uuid.uuid4().hex, "name": ask["name"], "arguments": ask.get("arguments", {}), "inapp": True}
        deadline = time.monotonic() + float(ask.get("timeout", 60))
        with LOCK:
            PENDING.append(item)
            LOCK.notify_all()
            while item["id"] not in RESULTS:
                left = deadline - time.monotonic()
                if left <= 0:
                    PENDING[:] = [p for p in PENDING if p["id"] != item["id"]]
                    self._json({"content": [{"type": "text", "text": "the window did not answer"}], "isError": True}, 504)
                    return
                LOCK.wait(timeout=min(left, 1.0))
            result = RESULTS.pop(item["id"])
        self._json(result)

    def _any(self) -> None:
        path = urlsplit(self.path).path
        body = self._body() if self.command in ("POST", "PUT", "PATCH", "DELETE") else b""
        if path == "/__stub/call" and self.command == "POST":
            return self._call(body)
        if path == "/__stub/state":
            with LOCK:
                return self._json({**{k: v for k, v in STATE.items() if k != "commands"}, "age": time.time() - STATE["last_poll"] if STATE["last_poll"] else None})
        if path == "/__stub/report" and self.command == "POST":
            with LOCK:
                STATE["report"] = json.loads(body or b"{}")
            return self._json({"ok": True})
        if path == "/__stub/catalogue":
            with LOCK:
                return self._json({"size": STATE["catalogue"], "missing": STATE["missing"], "commands": STATE["commands"]})
        if self.command in ("GET", "HEAD") and self._static():
            return
        note(self.command, path)
        if path == "/api/mcp/bridge/next":
            return self._next()
        if path == "/api/mcp/bridge/result" and self.command == "POST":
            got = json.loads(body or b"{}")
            with LOCK:
                RESULTS[str(got.get("id"))] = got.get("result") or {}
                LOCK.notify_all()
            return self._json({"ok": True})
        if path.startswith("/api/mcp/bridge/"):
            return self._json({"ok": True})
        if path == "/api/commands/catalogue" and self.command == "POST":
            got = json.loads(body or b"{}")
            with LOCK:
                STATE.update(catalogue=len(got.get("commands", [])), missing=got.get("missing", []), commands=got.get("commands", []))
            return self._json({"ok": True, "size": STATE["catalogue"]})
        self._proxy(body)

    do_GET = do_HEAD = do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _any


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("FORMVIS_STUB_PORT", "0"))), Handler)
    server.daemon_threads = True
    address = f"http://127.0.0.1:{server.server_address[1]}"
    if os.environ.get("FORMVIS_STUB_ADDRESS_FILE"):
        Path(os.environ["FORMVIS_STUB_ADDRESS_FILE"]).write_text(address)
    print(address, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
