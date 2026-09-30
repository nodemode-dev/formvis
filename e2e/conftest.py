"""Browser tests against the dev build (`./formvis dev` or `npx vite` on 5190), which exposes window.formvis.

FORMVIS_E2E_URL overrides the address; FORMVIS_E2E_CHROME points at a Chromium binary when Playwright's own is not
installed. Every test gets a fresh browser context, so storage (and crash recovery) starts empty.
"""
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

URL = os.environ.get("FORMVIS_E2E_URL", "http://127.0.0.1:5190/")
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


def _up() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


@pytest.fixture(scope="session", autouse=True)
def dev_server():
    if _up():
        yield
        return
    proc = subprocess.Popen(["npx", "vite", "--port", "5190", "--strictPort"], cwd=FRONTEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(120):
            if _up():
                break
            time.sleep(0.5)
        else:
            pytest.exit("The dev server did not start on 5190.", returncode=1)
        yield
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture(scope="session")
def browser(dev_server):
    with sync_playwright() as p:
        exe = os.environ.get("FORMVIS_E2E_CHROME") or None
        # WebGPU on SwiftShader, a software adapter, so the GPU blender's shaders can be checked here (Phase 18.2);
        # formvis's Automatic renderer still falls back to the CPU on a software GPU, as the GPU tests expect.
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox", "--enable-unsafe-webgpu", "--enable-unsafe-swiftshader", "--use-webgpu-adapter=swiftshader"])
        yield b
        b.close()


@pytest.fixture()
def context(browser):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    yield ctx
    ctx.close()


def open_app(page):
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    # After the app has loaded, any navigation of the page and its warnings are recorded, so an unexpected reload shows
    # where it went and what the page said first (1.52.1: one intermittent "execution context was destroyed").
    page.navigations = []
    page.warnings = []
    page.on("framenavigated", lambda f: page.navigations.append(f.url if f == page.main_frame else f"subframe {f.url}"))
    # 1.53.3: the Type anti-aliasing test lost its page a second time with no main-frame navigation recorded, so a
    # renderer crash or the page closing is recorded too.
    page.on("crash", lambda _p: page.navigations.append("RENDERER CRASHED"))
    page.on("close", lambda _p: page.navigations.append("page closed"))
    page.on("console", lambda m: page.warnings.append(f"{m.type}: {m.text}"[:300]) if m.type in ("warning", "error") else None)
    return errors


@pytest.fixture()
def page(context, request):
    pg = context.new_page()
    pg.errors = open_app(pg)
    yield pg
    if pg.navigations:
        print(f"\n[navigated after load] {request.node.nodeid}: {pg.navigations} warnings: {pg.warnings[-8:]}")
    assert not [e for e in pg.errors if "deliberate" not in e], pg.errors
