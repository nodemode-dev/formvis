#!/usr/bin/env python3
"""A window with no screen: Chromium (the one Playwright installs, as bench and perf use) opens formvis, follows the
person's stored choice on outside agents (kept by the engine in agents.json), and stays until it is told to stop.
With agents not allowed, or a step that needs approval, an agent's call is refused at once: nobody is there to answer. Document commands, the CLI and the MCP tools
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

ENGINE = os.environ.get("FORMVIS_URL", f"http://127.0.0.1:{os.environ.get('FORMVIS_PORT', '').lstrip('0') or 8190}").rstrip("/")


def key_taken() -> str:
    """Why a window with no screen cannot join this engine: its window key was already given to a window, or it is the desktop app's engine; empty when it can."""
    try:
        with urllib.request.urlopen(ENGINE + "/api/window/key", timeout=3) as r:
            state = json.loads(r.read().decode())
    except (urllib.error.URLError, OSError, ValueError):
        return ""
    if state.get("packaged"):
        return "This engine belongs to the formvis desktop app, which has a window of its own; a window with no screen cannot join it."
    if state.get("claimed"):
        return "This engine already gave its window key to a formvis window, so a window with no screen cannot join it. Use that window, or restart the engine (./formvis boot) and run this again before opening one."
    return ""


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
            page = context.new_page()
            page.goto(url)
            while not stop and os.getppid() == parent:
                page.wait_for_timeout(300)
            page.evaluate("fetch('/api/mcp/bridge/stop', {method: 'POST'}).then(() => 1, () => 0)")
        finally:
            browser.close()
    return 0


def ensure(timeout: float = 90.0):
    """None when a window is already open and allowed; else a started headless window (the process to hand to release),
    waited for until the engine sees it. RuntimeError says why it could not start."""
    now = status()
    if not now:
        raise RuntimeError(f"The formvis engine is not answering at {ENGINE}. Start it with ./formvis boot (or ./formvis serve), then retry.")
    if now.get("live"):
        return None
    taken = key_taken()
    if taken:
        raise RuntimeError(taken)
    try:
        import playwright  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("--headless needs Playwright: python3 -m pip install playwright, then python3 -m playwright install chromium.") from exc
    clean_logs()
    log = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"formvis-headless-{os.getpid()}.log")
    with open(log, "wb") as out:
        proc = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--run", window_url()], stdin=subprocess.DEVNULL, stdout=out, stderr=out)
    proc.log = log
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if proc.poll() is not None:
            with open(log, encoding="utf-8", errors="replace") as f:
                lines = f.read().strip().splitlines()
            remove_log(log)
            raise RuntimeError("The headless window stopped" + (": " + lines[-1] if lines else "."))
        seen = status()
        if seen.get("live"):
            return proc
        time.sleep(0.5)
    release(proc)
    raise RuntimeError(f"The headless window did not connect within {int(timeout)} seconds (page {window_url()}).")


def remove_log(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def clean_logs() -> None:
    """Deletes the formvis-headless-PID.log files of runs that are gone (a process with that id no longer exists, or the file is over a day old)."""
    import glob
    folder = os.environ.get("TMPDIR", "/tmp")
    for path in glob.glob(os.path.join(folder, "formvis-headless-*.log")):
        try:
            pid = int(os.path.basename(path)[len("formvis-headless-"):-len(".log")])
            old = time.time() - os.path.getmtime(path) > 86400
            if pid == os.getpid():
                continue
            os.kill(pid, 0)
            alive = not old
        except ValueError:
            alive = False
        except ProcessLookupError:
            alive = False
        except (PermissionError, OSError):
            alive = True
        if not alive:
            remove_log(path)


def release(proc) -> None:
    """Stops a window ensure started: asked to close, then killed if it does not within 20 seconds."""
    if proc is None:
        return
    if proc.poll() is not None:
        remove_log(getattr(proc, "log", ""))
        return
    proc.terminate()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    remove_log(getattr(proc, "log", ""))


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
