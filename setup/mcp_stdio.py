#!/usr/bin/env python3
"""formvis over MCP's stdio transport (1.52.1): for clients that launch a server as a program (Claude Desktop). Each line
from the client, a JSON-RPC message, goes to the running engine's /mcp; each reply comes back as one line. Notifications
get no reply. Only protocol messages are written to stdout; anything else goes to stderr, as stdio requires.
The engine's address: FORMVIS_MCP_URL, or http://127.0.0.1:8190/mcp. With the default address, an engine not running
is started (1.53.3).

  ./formvis mcp --attach   never start the engine: with none running, only ping is offered, and the client is told
                           (notifications/tools/list_changed) once the engine answers. FORMVIS_MCP_ATTACH=1 does the same.
  ./formvis mcp --headless a window with no screen is started when none is open (./formvis headless) and closed when the client
                           goes away, so edits run with nothing on screen
  ./formvis mcp --root DIR   (repeatable) file tools may read and write inside DIR only; --read-root DIR (repeatable) adds
                           folders that may be read but not written; a call outside them is refused here, before the engine
  ./formvis mcp --where    print the launcher's path and the config to paste into a client, then exit
  ./formvis mcp --version  print the version, then exit

The server declares tools.listChanged, and tells the client (notifications/tools/list_changed) when the engine's tool count
changes or the engine comes back."""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.error
import urllib.request

URL = os.environ.get("FORMVIS_MCP_URL", "http://127.0.0.1:8190/mcp")
PORT_FILE = os.environ.get("FORMVIS_PORT_FILE", "")   # the packaged app (its `mcp` mode): the engine keeps its own port here while it runs
ATTACH = os.environ.get("FORMVIS_MCP_ATTACH", "0") == "1"
_down = False   # attach mode: the engine did not answer the last request
_changed = False   # attach mode: the engine answers again, so the client's tool list is stale
OFFLINE = "formvis is not running. Start it with ./formvis boot (or open the formvis app), then ask again."
PING_ONLY = [{"name": "ping", "description": "Reports whether formvis is running. It is not running now; start it with ./formvis boot, and the other tools appear.",
              "inputSchema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False}, "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}}]


TOOLSET = os.environ.get("FORMVIS_MCP_TOOLS", "")   # "core": the 31 most used tools, for clients that cap their tools (Cursor)
_session = ""   # the engine's Mcp-Session-Id from initialize, which ties later calls to the client's name
ROOTS: list[str] = []   # --root: folders the file tools may read and write
READ_ROOTS: list[str] = []   # --read-root: folders they may only read
WRITES = {"save_project", "export_image", "export_mask", "export_layer", "timeline_render"}   # tools whose path is written; output_path always is
CONTROL = {"app.open": "open_file", "app.save": "save_project", "app.export": "export_image"}
_out = threading.Lock()
_watching = False


def emit(text: str) -> None:
    with _out:
        sys.stdout.write(text + "\n")
        sys.stdout.flush()


def inside(path: str, folders: list[str]) -> bool:
    real = os.path.realpath(os.path.expanduser(path))
    for folder in folders:
        try:
            if os.path.commonpath([real, folder]) == folder:
                return True
        except ValueError:
            continue
    return False


def outside_roots(msg: dict) -> str | None:
    """Why a tools/call is refused for its file paths under --root and --read-root; None when it is fine or no roots were given."""
    if not (ROOTS or READ_ROOTS) or msg.get("method") != "tools/call":
        return None
    params = msg.get("params") or {}
    name, args = params.get("name"), params.get("arguments") or {}
    if name == "control_call" and isinstance(args, dict):
        method, inner = str(args.get("method")), args.get("params")
        name, args = CONTROL.get(method, method), inner if isinstance(inner, dict) else {}
    if name in ("save_project", "export_image") and not (isinstance(args.get("path"), str) and args["path"].strip()):
        return f"{name} with no path writes back to the file the document came from, which may be outside the folders this server may write: give a path inside {', '.join(ROOTS) or 'a --root folder'}."
    for key in ("path", "output_path"):
        value = args.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        writing = key == "output_path" or name in WRITES
        if not inside(value, ROOTS if writing else ROOTS + READ_ROOTS):
            return f"{key} {value} is outside the folders this server may {'write' if writing else 'read'} ({', '.join(ROOTS if writing else ROOTS + READ_ROOTS) or 'none'})."
    return None


def watch_tools() -> None:
    """Once per session: a thread that tells the client the tool list changed when the engine's tool count does."""
    global _watching
    if _watching:
        return
    _watching = True

    def count() -> int | None:
        try:
            with urllib.request.urlopen(URL.rsplit("/mcp", 1)[0] + "/api/mcp/status", timeout=3) as r:
                return json.loads(r.read().decode()).get("tools")
        except (urllib.error.URLError, OSError, ValueError):
            return None

    def loop() -> None:
        import time
        last = count()
        while True:
            time.sleep(5)
            now = count()
            if now is not None and last is not None and now != last:
                emit(json.dumps({"jsonrpc": "2.0", "method": "notifications/tools/list_changed"}))
            if now is not None:
                last = now

    threading.Thread(target=loop, daemon=True).start()


def with_list_changed(msg: dict, body: str) -> str:
    """The engine's initialize and discover answers, with tools.listChanged declared (this transport sends the notification)."""
    if msg.get("method") not in ("initialize", "server/discover"):
        return body
    try:
        answer = json.loads(body)
        answer["result"]["capabilities"].setdefault("tools", {})["listChanged"] = True
    except (ValueError, KeyError, TypeError, AttributeError):
        return body
    watch_tools()
    return json.dumps(answer)


def forward(line: str) -> str | None:
    global _session
    try:
        msg = json.loads(line)
    except ValueError:
        return json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
    refused = outside_roots(msg)
    if refused:
        return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "result": {"content": [{"type": "text", "text": refused}], "isError": True}}) if msg.get("id") is not None else None
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
        if isinstance(exc, TimeoutError) or isinstance(getattr(exc, "reason", None), TimeoutError):
            print("[formvis mcp] formvis did not answer in time; the request was dropped and will not run later.", file=sys.stderr, flush=True)
            if msg.get("id") is None:
                return None
            return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "result": {"content": [{"type": "text", "text": "formvis did not answer in time: it may be busy, or its window is closed. The request was dropped and will not run later. Check the formvis window, then retry."}], "isError": True}})
        print(f"[formvis mcp] the engine is not answering at {URL}: {exc}", file=sys.stderr, flush=True)
        if ATTACH:
            return offline(msg, version)
        if start_engine():   # 1.53.3: started here, once, then the request goes again
            return forward(line)
        if msg.get("id") is None:
            return None
        return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32000, "message": "The formvis engine is not running and could not be started: run ./formvis boot in the formvis folder, then retry."}})
    global _down, _changed
    if _down:
        _down, _changed = False, True
    if msg.get("id") is None:
        return None   # a notification: no reply
    return with_list_changed(msg, body.strip()) if body.strip() else None


def offline(msg: dict, version: str) -> str | None:
    """Attach mode with no engine: the client still gets answers, with only ping to call (the stub says formvis is not running)."""
    global _down
    _down = True
    rid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if rid is None:
        return None
    done = {"resultType": "complete"} if version == "2026-07-28" else {}
    server = {"name": "formvis", "version": "not running"}
    if method == "server/discover":
        result = {"supportedVersions": ["2026-07-28", "2025-11-25"], "capabilities": {"tools": {"listChanged": True}, "prompts": {}}, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": OFFLINE}
    elif method == "initialize":
        result = {"protocolVersion": params.get("protocolVersion") or "2025-11-25", "capabilities": {"tools": {"listChanged": True}, "prompts": {}}, "serverInfo": server, "instructions": OFFLINE}
    elif method == "tools/list":
        result = {"tools": PING_ONLY}
    elif method == "tools/call":
        if params.get("name") != "ping":
            result = {"content": [{"type": "text", "text": OFFLINE}], "isError": True}
        else:
            result = {"content": [{"type": "text", "text": OFFLINE}], "structuredContent": {"version": "not running", "window": False, "allowed": False, "documents": []}}
    elif method in ("ping", "prompts/list", "resources/list"):
        result = {"prompts": []} if method == "prompts/list" else {"resources": []} if method == "resources/list" else {}
    else:
        return json.dumps({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}})
    return json.dumps({"jsonrpc": "2.0", "id": rid, "result": {**result, **done}})


def packaged_url() -> str | None:
    """The address of the packaged app's engine while it runs: the port it wrote to engine.port, when its process is alive."""
    if not PORT_FILE:
        return None
    try:
        with open(PORT_FILE, encoding="utf-8") as f:
            held = json.load(f)
        port = int(held["port"])
        if os.name == "posix":
            os.kill(int(held["pid"]), 0)
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return f"http://127.0.0.1:{port}/mcp"


def start_packaged(launcher: str) -> bool:
    """The packaged app (the AppImage, or the app bundle's binary) started detached, which starts its engine and window;
    waits for the port the engine writes. True once the engine answers."""
    global URL
    import subprocess
    import tempfile
    import time
    log = open(os.path.join(tempfile.gettempdir(), "formvis-engine.log"), "ab")
    print(f"[formvis mcp] starting formvis ({launcher}); its log: {log.name}", file=sys.stderr, flush=True)
    try:
        subprocess.Popen([launcher], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, creationflags=0x208 if os.name == "nt" else 0)
    except OSError as exc:
        print(f"[formvis mcp] formvis could not start: {exc}", file=sys.stderr, flush=True)
        return False
    for _ in range(240):
        time.sleep(0.5)
        found = packaged_url()
        if not found:
            continue
        try:
            with urllib.request.urlopen(found.rsplit("/mcp", 1)[0] + "/api/version", timeout=2) as r:
                if r.status == 200:
                    URL = found
                    return True
        except (urllib.error.URLError, OSError):
            continue
    return False


_started = False


def start_engine() -> bool:
    """The engine started for the client (1.53.3), once: ./formvis serve when the app is built (one process, the engine
    serving it), else ./formvis boot; detached, its output to a log in the temporary folder, never to stdout (the MCP
    channel). True once it answers. FORMVIS_MCP_AUTOSTART=0 turns this off. In the packaged app (its `mcp` mode, 1.90.9)
    the app itself is started from FORMVIS_LAUNCHER."""
    global _started
    if _started or os.environ.get("FORMVIS_MCP_AUTOSTART", "1") == "0" or os.environ.get("FORMVIS_MCP_URL"):
        return False
    _started = True
    if PORT_FILE:
        return bool(os.environ.get("FORMVIS_LAUNCHER")) and start_packaged(os.environ["FORMVIS_LAUNCHER"])
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
    global ATTACH, _changed, URL
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    headless, args, i = False, sys.argv[1:], 0
    while i < len(args):
        flag = args[i]
        i += 1
        if flag in ("--root", "--read-root"):
            if i >= len(args):
                print(f"{flag} needs a folder.", file=sys.stderr)
                sys.exit(2)
            (ROOTS if flag == "--root" else READ_ROOTS).append(os.path.realpath(os.path.expanduser(args[i])))
            i += 1
        elif flag == "--headless":
            headless = True
        elif flag == "--attach":
            ATTACH = True
        elif flag == "--where":
            launcher = (os.environ.get("FORMVIS_LAUNCHER") if PORT_FILE else None) or os.path.join(root, "formvis.bat" if os.name == "nt" else "formvis")
            command, cargs = (sys.executable, [os.path.abspath(__file__)]) if os.name == "nt" and not PORT_FILE else (launcher, ["mcp"])
            print(json.dumps({"launcher": launcher, "script": os.path.abspath(__file__), "url": URL, "claude_desktop": {"mcpServers": {"formvis": {"command": command, "args": cargs}}}}, indent=2))
            return
        elif flag == "--version":
            import re
            try:
                with open(os.path.join(root, "frontend", "src", "version.ts"), encoding="utf-8") as f:
                    print("formvis " + (re.search(r"VERSION = '([^']+)'", f.read()) or [None, "unknown"])[1])
            except OSError:
                print("formvis unknown")
            return
        else:
            print(f"{flag}: not an option. ./formvis mcp takes --attach, --headless, --root, --read-root, --where and --version.", file=sys.stderr)
            sys.exit(2)
    if PORT_FILE:
        URL = packaged_url() or URL
    held = None
    if headless:
        held = start_headless()
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            out = forward(line)
            if _changed:
                _changed = False
                emit(json.dumps({"jsonrpc": "2.0", "method": "notifications/tools/list_changed"}))
            if out:
                emit(out)
    finally:
        if held is not None:
            import headless as window_host
            window_host.release(held)


def start_headless():
    """The engine started if need be, then a window with no screen when none is open; None when none was needed or it could not start (said on stderr)."""
    import headless as window_host
    try:
        urllib.request.urlopen(URL.rsplit("/mcp", 1)[0] + "/api/version", timeout=2).close()
    except (urllib.error.URLError, OSError):
        if not start_engine():
            print("[formvis mcp] --headless: the engine is not running and could not be started.", file=sys.stderr, flush=True)
            return None
    try:
        return window_host.ensure()
    except RuntimeError as exc:
        print(f"[formvis mcp] --headless: {exc}", file=sys.stderr, flush=True)
        return None


if __name__ == "__main__":
    main()
