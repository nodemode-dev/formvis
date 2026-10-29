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


SHARD_SECONDS = 5.5
SLOW_SECONDS = {
    "e2e/test_offered_options.py::test_every_menu_command_runs": 55.0,
    "e2e/test_offered_options.py::test_every_menu_command_runs[3]": 190.0,
    "e2e/test_offered_options.py::test_every_menu_command_runs[8]": 80.0,
    "e2e/test_offered_options.py::test_every_menu_command_runs[9]": 130.0,
    "e2e/test_offered_options.py::test_every_tool_option_at_every_value": 65.0,
    "e2e/test_cover_top_history.py::test_earlier_states_lists_the_unsaved_document_a_restart_found_and_opens_it_as_a_tab": 30.0,
}


def pytest_collection_modifyitems(config, items):
    # FORMVIS_E2E_SHARD="i/n" keeps the tests that fall to shard i of n, dealt by expected CI seconds (SHARD_SECONDS a
    # test, SLOW_SECONDS for the long ones), heaviest first to the lightest shard. A file stays whole unless it outweighs
    # half a shard; then its tests are dealt one by one (1.98.0: test_offered_options alone held one of 10 shards at 38 min).
    shard = os.environ.get("FORMVIS_E2E_SHARD")
    if not shard:
        return
    index, total = (int(x) for x in shard.split("/"))

    def seconds(item) -> float:
        return SLOW_SECONDS.get(item.nodeid, SLOW_SECONDS.get(item.nodeid.split("[")[0], SHARD_SECONDS))

    files: dict[str, list] = {}
    for item in items:
        files.setdefault(item.nodeid.split("::")[0], []).append(item)
    half = sum(seconds(i) for i in items) / total / 2
    units = []
    for name, group in files.items():
        weight = sum(seconds(i) for i in group)
        units += [(seconds(i), i.nodeid, [i]) for i in group] if weight > half else [(weight, name, group)]
    loads = [0.0] * total
    keep, drop = [], []
    for weight, _key, group in sorted(units, key=lambda u: (-u[0], u[1])):
        k = loads.index(min(loads))
        loads[k] += weight
        (keep if k + 1 == index else drop).extend(group)
    order = {id(i): n for n, i in enumerate(items)}
    keep.sort(key=lambda i: order[id(i)])
    config.hook.pytest_deselected(items=drop)
    items[:] = keep


@pytest.fixture(scope="session", autouse=True)
def dev_server():
    if _up():
        yield
        return
    # --host 127.0.0.1: the address _up() probes. Left to itself Vite listens on "localhost", which can resolve to ::1
    # only (it does on macOS, and CI's e2e job stopped with "did not start on 5190" before any test ran).
    proc = subprocess.Popen(["npx", "vite", "--host", "127.0.0.1", "--port", "5190", "--strictPort"], cwd=FRONTEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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


@pytest.fixture(scope="module")
def browser(dev_server):
    # One browser per test file (1.72.7): with one browser for the whole run, nine tests that pass alone failed late in
    # a 31-minute pass, from state the browser process kept (its GPU and SwiftShader memory) across 500 tests.
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
