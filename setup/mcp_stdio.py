#!/usr/bin/env python3
"""formvis over MCP's stdio transport (1.52.1): for clients that launch a server as a program (Claude Desktop). Each line
from the client, a JSON-RPC message, goes to the running engine's /mcp; each reply comes back as one line. Notifications
get no reply. Only protocol messages are written to stdout; anything else goes to stderr, as stdio requires.
The engine's address: FORMVIS_MCP_URL, or http://127.0.0.1:8190/mcp. With the default address, an engine not running
is started (1.53.3)."""

import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("FORMVIS_MCP_URL", "http://127.0.0.1:8190/mcp")


TOOLSET = os.environ.get("FORMVIS_MCP_TOOLS", "")   # "core": the 31 most used tools, for clients that cap their tools (Cursor)
_session = ""   # the engine's Mcp-Session-Id from initialize, which ties later calls to the client's name


def forward(line: str) -> str | None:
    global _session
    try:
        msg = json.loads(line)
    except ValueError:
        return json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
    version = ((msg.get("params") or {}).get("_meta") or {}).get("io.modelcontextprotocol/protocolVersion") or (msg.get("params") or {}).get("protocolVersion") or "2025-11-25"
    headers = {"Content-Type": "application/json", "Accept": "application/json", "MCP-Protocol-Version": version}
    if _session:
        headers["Mcp-Session-Id"] = _session
    req = urllib.request.Request(URL + ("?tools=" + TOOLSET if TOOLSET and "?" not in URL else ""), data=line.encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=660) as r:
            body = r.read().decode()
            _session = r.headers.get("Mcp-Session-Id") or _session
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() or ""
    except (urllib.error.URLError, OSError) as exc:
        print(f"[formvis mcp] the engine is not answering at {URL}: {exc}", file=sys.stderr, flush=True)
        if start_engine():   # 1.53.3: started here, once, then the request goes again
            return forward(line)
        if msg.get("id") is None:
            return None
        return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32000, "message": "The formvis engine is not running and could not be started: run ./formvis boot in the formvis folder, then retry."}})
    if msg.get("id") is None:
        return None   # a notification: no reply
    return body.strip() or None


_started = False


def start_engine() -> bool:
    """The engine started for the client (1.53.3), once: ./formvis serve when the app is built (one process, the engine
    serving it), else ./formvis boot; detached, its output to a log in the temporary folder, never to stdout (the MCP
    channel). True once it answers. FORMVIS_MCP_AUTOSTART=0 turns this off."""
    global _started
    if _started or os.environ.get("FORMVIS_MCP_AUTOSTART", "1") == "0" or os.environ.get("FORMVIS_MCP_URL"):
        return False
    _started = True
    import subprocess
    import tempfile
    import time
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    command = "serve" if os.path.isfile(os.path.join(root, "frontend", "dist", "index.html")) else "boot"
    log = open(os.path.join(tempfile.gettempdir(), "formvis-engine.log"), "ab")
    print(f"[formvis mcp] starting the engine (./formvis {command}); its log: {log.name}", file=sys.stderr, flush=True)
    subprocess.Popen([os.path.join(root, "formvis"), command], cwd=root, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    for _ in range(120):
        time.sleep(0.5)
        try:
            with urllib.request.urlopen(URL.rsplit("/mcp", 1)[0] + "/api/version", timeout=2) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            continue
    return False


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        out = forward(line)
        if out:
            sys.stdout.write(out + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
