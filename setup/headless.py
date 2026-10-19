#!/usr/bin/env python3
"""A window with no screen: Chromium (the one Playwright installs, as bench and perf use) opens formvis, allows outside
agents for that one browser profile, and stays until it is told to stop. Document commands, the CLI and the MCP tools
then run against it without a visible window.

  ./formvis headless [--url URL] [--timeout SECONDS]   start it and stay until Ctrl-C or SIGTERM; closes the browser cleanly
  ./formvis cli <subcommand> --headless ...            starts one for that run when no window is open, and closes it after
  ./formvis mcp --headless                             the same for an MCP session

The page is the one the engine serves when the app is built (./formvis serve), else the dev page on FORMVIS_WINDOW_URL
(default http://localhost:5190/). The engine is FORMVIS_URL (default http://127.0.0.1:8190) and must be running.
It needs Playwright and its Chromium: python3 -m pip install playwright, then python3 -m playwright install chromium."""

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

ENGINE = os.environ.get("FORMVIS_URL", "http://127.0.0.1:8190").rstrip("/")
SEED = ("try{const k='formvis.prefs',o=JSON.parse(localStorage.getItem(k)||'{}');"
        "if(o.agentsAllowed!==true){o.agentsAllowed=true;localStorage.setItem(k,JSON.stringify(o));}}catch(e){}")


def status() -> dict:
    try:
        with urllib.request.urlopen(ENGINE + "/api/mcp/status", timeout=3) as r:
            return json.loads(r.read().decode())
    except (urllib.error.URLError, OSError, ValueError):
        return {}


def window_url() -> str:
    """The engine itself when it serves the built app, else the dev page."""
    try:
        with urllib.request.urlopen(ENGINE + "/", timeout=3) as r:
            if r.status == 200 and "text/html" in r.headers.get("Content-Type", ""):
                return ENGINE + "/"
    except (urllib.error.URLError, OSError):
        pass
    return os.environ.get("FORMVIS_WINDOW_URL", "http://localhost:5190/")


def host(url: str) -> int:
    from playwright.sync_api import sync_playwright
    stop: list[int] = []
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.append(1))
    parent = os.getppid()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            context = browser.new_context(viewport={"width": 1400, "height": 900})
            context.add_init_script(SEED)
            page = context.new_page()
            page.goto(url)
            while not stop and os.getppid() == parent:
                page.wait_for_timeout(300)
        finally:
            browser.close()
    return 0


def ensure(timeout: float = 90.0):
    """None when a window is already open and allowed; else a started headless window (the process to hand to release),
    waited for until the engine sees it. RuntimeError says why it could not start."""
    now = status()
    if not now:
        raise RuntimeError(f"The formvis engine is not answering at {ENGINE}. Start it with ./formvis boot (or ./formvis serve), then retry.")
    if now.get("live") and now.get("allowed"):
        return None
    try:
        import playwright  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("--headless needs Playwright: python3 -m pip install playwright, then python3 -m playwright install chromium.") from exc
    log = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"formvis-headless-{os.getpid()}.log")
    with open(log, "wb") as out:
        proc = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--run", window_url()], stdin=subprocess.DEVNULL, stdout=out, stderr=out)
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if proc.poll() is not None:
            with open(log, encoding="utf-8", errors="replace") as f:
                lines = f.read().strip().splitlines()
            raise RuntimeError("The headless window stopped" + (": " + lines[-1] if lines else "."))
        seen = status()
        if seen.get("live") and seen.get("allowed"):
            return proc
        time.sleep(0.5)
    release(proc)
    raise RuntimeError(f"The headless window did not connect within {int(timeout)} seconds (page {window_url()}).")


def release(proc) -> None:
    """Stops a window ensure started: asked to close, then killed if it does not within 20 seconds."""
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    try:   # the engine counts a window live for 30 seconds after its last poll: tell it this one is gone
        urllib.request.urlopen(urllib.request.Request(ENGINE + "/api/mcp/bridge/stop", method="POST"), timeout=3).close()
    except (urllib.error.URLError, OSError):
        pass


def main(argv: list[str]) -> int:
    if argv[:1] == ["--run"] and len(argv) == 2:
        return host(argv[1])
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    url, timeout, i = "", 90.0, 0
    while i < len(argv):
        if argv[i] == "--url" and i + 1 < len(argv):
            url, i = argv[i + 1], i + 2
        elif argv[i] == "--timeout" and i + 1 < len(argv):
            timeout, i = float(argv[i + 1]), i + 2
        else:
            print(f"{argv[i]}: not an option. ./formvis headless takes --url and --timeout.", file=sys.stderr)
            return 2
    if url:
        os.environ["FORMVIS_WINDOW_URL"] = url
    try:
        proc = ensure(timeout)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1
    if proc is None:
        print("A window is already open and allowed; nothing to start.")
        return 0
    print(f"headless window up (pid {proc.pid}); engine {ENGINE}. Ctrl-C closes it.", flush=True)
    stop: list[int] = []
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.append(1))
    while not stop and proc.poll() is None:
        time.sleep(0.5)
    release(proc)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
