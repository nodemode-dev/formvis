"""Threads in the real WebKitGTK window: whether the page is cross-origin isolated (window.crossOriginIsolated, SharedArrayBuffer),
and that a banded 16-bit Gaussian Blur on a layer over 16 million pixels, run on the worker pool, gives the pixels the single
thread gives, whichever route (shared memory or transferred copies) the window allows.

The stub sends the engine's own isolation headers (Cross-Origin-Opener-Policy same-origin, Cross-Origin-Embedder-Policy
credentialless) with the page, as the engine does, and reports what the page saw to its state (the script it adds to index.html)."""
import base64
import io

import pytest
from PIL import Image, ImageChops

from e2e.desktop import support

BIG = (8200, 2000)
SMALL = (300, 2000)
RECT = (40, 560)
SEAMS_AT = 490


def isolation(app) -> dict:
    return app.wait_for(lambda: app.state().get("report"), timeout=30, what="the page to report what it can do")


def test_the_window_reports_its_isolation_and_what_follows_from_it(fresh):
    fresh.launch()
    seen = isolation(fresh)
    print("window report:", seen)
    assert seen["worker"] == "function", "dedicated workers exist in the WebKitGTK window"
    assert seen["secure"] is True, "the engine's own 127.0.0.1 address is a secure context"
    assert "WebKit" in seen["agent"]
    assert seen["sab"] in ("function", "undefined")
    assert seen["isolated"] == (seen["sab"] == "function"), "SharedArrayBuffer exists exactly where the page is cross-origin isolated"
    assert fresh.state()["report"] == seen


def picture(out: dict) -> Image.Image:
    for item in out.get("content", []):
        if item.get("type") == "image":
            return Image.open(io.BytesIO(base64.b64decode(item["data"]))).convert("RGB")
    raise AssertionError(f"no picture in {str(out)[:300]}")


def blurred_window(app, size: tuple[int, int], x: int) -> Image.Image:
    app.ok("new_document", {"width": size[0], "height": size[1], "depth": 16, "background": "white"}, timeout=240)
    app.ok("select", {"shape": "rectangle", "x": x, "y": SEAMS_AT, "width": RECT[0], "height": RECT[1]})
    app.ok("fill", {"color": "#cc2244"})
    app.ok("select", {"shape": "none"})
    app.ok("apply_filter", {"kind": "gaussianBlur", "settings": {"radius": 6}}, timeout=420)
    return picture(app.call("get_image", {"view": "document", "x": x - 50, "y": SEAMS_AT - 20, "width": RECT[0] + 100, "height": RECT[1] + 40, "max_size": 2048}, timeout=240))


def web_threads(app) -> int:
    pid = app.web_process()
    if not pid:
        return 0
    return len(list((support.Path("/proc") / str(pid) / "task").iterdir()))


@pytest.mark.parametrize("mode", ["isolated", "not-isolated"])
def test_a_banded_16_bit_blur_on_the_pool_equals_the_single_thread(fresh, mode):
    env = {} if mode == "isolated" else {"FORMVIS_ISOLATED": "0"}
    fresh.launch(extra_env=env)
    seen = isolation(fresh)
    print(mode, "window report:", seen)
    if mode == "not-isolated":
        assert seen["isolated"] is False and seen["sab"] == "undefined"
    before = web_threads(fresh)
    banded = blurred_window(fresh, BIG, 4000)
    print(mode, "web process threads before/after the banded blur:", before, web_threads(fresh))
    single = blurred_window(fresh, SMALL, 100)
    assert banded.size == single.size
    assert ImageChops.difference(banded, single).getbbox() is None, "the banded blur differs from the single thread"
    flat = banded.getpixel((0, 0))
    assert flat == (255, 255, 255), flat
    assert banded.getpixel((banded.width // 2, banded.height // 2)) != (255, 255, 255), "the rectangle is there, blurred"
    assert fresh.alive()
