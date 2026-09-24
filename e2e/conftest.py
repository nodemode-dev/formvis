"""Browser tests against the dev build (`./sonny dev` or `npx vite` on 5190), which exposes window.sonny.

SONNY_E2E_URL overrides the address; SONNY_E2E_CHROME points at a Chromium binary when Playwright's own is not
installed. Every test gets a fresh browser context, so storage (and crash recovery) starts empty.
"""
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

URL = os.environ.get("SONNY_E2E_URL", "http://127.0.0.1:5190/")
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
        exe = os.environ.get("SONNY_E2E_CHROME") or None
        # WebGPU on SwiftShader, a software adapter, so the GPU blender's shaders can be checked here (Phase 18.2);
        # sonny's Automatic renderer still falls back to the CPU on a software GPU, as the GPU tests expect.
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
    page.wait_for_function("window.sonny && window.sonny.engine", timeout=60000)
    return errors


@pytest.fixture()
def page(context):
    pg = context.new_page()
    pg.errors = open_app(pg)
    yield pg
    assert not [e for e in pg.errors if "deliberate" not in e], pg.errors
