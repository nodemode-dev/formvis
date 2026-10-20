"""PC-AU-0135: the static web build. `vite build --base /formvis/` goes to a scratch folder outside the repository, a plain
Python http.server serves it under that sub-path with the isolation headers of docs/hosting, and the editor loads in Chromium,
makes a new document and paints, with no engine service behind it (every /api call is a 404)."""
import functools
import http.server
import socket
import subprocess
import tempfile
import threading
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
SUB = "/formvis/"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()

    def log_message(self, *_args):
        pass


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def site():
    with tempfile.TemporaryDirectory(prefix="formvis-web-") as tmp:
        root = Path(tmp)
        out = root / "serve" / SUB.strip("/")
        build = subprocess.run(["npx", "vite", "build", "--base", SUB, "--outDir", str(out), "--emptyOutDir", "--sourcemap", "false"],
                               cwd=FRONTEND, capture_output=True, text=True, timeout=300)
        assert build.returncode == 0, build.stdout[-2000:] + build.stderr[-2000:]
        port = free_port()
        assert port not in (5190, 8190)
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(root / "serve")))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            yield {"url": f"http://127.0.0.1:{port}{SUB}", "dir": out}
        finally:
            srv.shutdown()
            srv.server_close()


def test_the_build_is_a_static_folder_under_the_sub_path(site):
    index = (site["dir"] / "index.html").read_text()
    assert f'src="{SUB}assets/' in index and 'src="/assets/' not in index
    assert (site["dir"] / "favicon.svg").exists()
    assert not list(site["dir"].glob("**/*.map"))


def test_the_built_editor_makes_a_document_and_paints_without_the_engine(context, site):
    page = context.new_page()
    errors, bad = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    page.goto(site["url"])
    page.wait_for_selector("[data-cmd=new]", timeout=60000)
    assert page.evaluate("crossOriginIsolated") is True
    assert page.evaluate("Object.keys(window.formvis || {})") == ["catalogue"]    # the production build exposes no test hooks
    page.locator("[data-cmd=new]").first.dispatch_event("click")
    page.wait_for_selector(".cv-newdoc")
    page.locator(".cv-newdoc .cv-btn-primary").click()
    scene = page.locator("canvas.cv-scene")
    scene.wait_for(state="visible", timeout=30000)
    box = scene.bounding_box()
    assert box and box["width"] > 100 and box["height"] > 100
    page.mouse.move(box["x"] + 20, box["y"] + 20)
    page.mouse.click(box["x"] + 5, box["y"] + 5)
    page.keyboard.press("b")
    before = scene.screenshot()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx - 150, cy)
    page.mouse.down()
    for i in range(1, 16):
        page.mouse.move(cx - 150 + i * 20, cy + (i % 3) * 6, steps=2)
    page.mouse.up()
    page.wait_for_timeout(400)
    assert scene.screenshot() != before, "the stroke left no mark on the canvas"
    api = [b for b in bad if "/api/" in b]
    assert api, "the engine service should be absent in this run"
    assert not [b for b in bad if "/api/" not in b], bad
    assert not errors, errors
    page.close()
