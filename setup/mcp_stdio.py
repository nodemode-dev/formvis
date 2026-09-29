#!/usr/bin/env python3
"""formvis over MCP's stdio transport (1.52.1): for clients that launch a server as a program (Claude Desktop). Each line
from the client, a JSON-RPC message, goes to the running engine's /mcp; each reply comes back as one line. Notifications
get no reply. Only protocol messages are written to stdout; anything else goes to stderr, as stdio requires.
The engine's address: FORMVIS_MCP_URL, or http://127.0.0.1:8190/mcp."""

import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("FORMVIS_MCP_URL", "http://127.0.0.1:8190/mcp")


def forward(line: str) -> str | None:
    try:
        msg = json.loads(line)
    except ValueError:
        return json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
    version = ((msg.get("params") or {}).get("_meta") or {}).get("io.modelcontextprotocol/protocolVersion") or (msg.get("params") or {}).get("protocolVersion") or "2025-11-25"
    req = urllib.request.Request(URL, data=line.encode(), method="POST", headers={"Content-Type": "application/json", "Accept": "application/json", "MCP-Protocol-Version": version})
    try:
        with urllib.request.urlopen(req, timeout=660) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() or ""
    except (urllib.error.URLError, OSError) as exc:
        print(f"[formvis mcp] the engine is not answering at {URL}: {exc}", file=sys.stderr, flush=True)
        if msg.get("id") is None:
            return None
        return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32000, "message": "The formvis engine is not running (./formvis boot)."}})
    if msg.get("id") is None:
        return None   # a notification: no reply
    return body.strip() or None


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
