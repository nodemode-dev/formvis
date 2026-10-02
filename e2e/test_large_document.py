"""The register's M5 test (DEV_PLAN 26.5): a 15,000 by 10,000 document painted, filtered and saved within the memory
budget on this computer, then closed, reopened with the same pixels, and exported as PNG. Opt-in, as it takes several
minutes and is sized for a computer like the 4 GB test machine: FORMVIS_LARGE=1, with the engine running (./formvis
dev). After every stage the memory formvis counts must be inside its budget, and the page must never be lost."""
import json
import os
import time
import urllib.request

import pytest
from PIL import Image

from .conftest import open_app

ENGINE = "http://127.0.0.1:8190"
META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "e2e", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}
pytestmark = pytest.mark.skipif(os.environ.get("FORMVIS_LARGE") != "1", reason="opt-in: FORMVIS_LARGE=1 (several minutes, a 150 MP document)")

WITHIN = "window.formvis.engine.memoryUse() <= window.formvis.engine.memoryBudget"
TILES = """(() => { const q = window.formvis.engine.current.doc.layers[0].raster; return [[1000, 1000], [7000, 4000], [13000, 8500]].map(([x, y]) => {
  const u = new Uint32Array(q.ctx.getImageData(x, y, 1024, 1024).data.buffer); let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; }); })()"""


def _engine_up() -> bool:
    try:
        with urllib.request.urlopen(f"{ENGINE}/api/version", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def _mcp(tool: str, **args) -> dict:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args, "_meta": META}}).encode()
    req = urllib.request.Request(f"{ENGINE}/mcp", data=body, headers={"Content-Type": "application/json", "Accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=1200).read())["result"]


def _until(page, expr: str, seconds: int) -> None:
    end = time.time() + seconds
    while not page.evaluate(expr):
        assert time.time() < end, f"not within {seconds} s: {expr[:80]}"
        time.sleep(2)


def test_150_megapixels_painted_filtered_saved(context, tmp_path):
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (./formvis dev)")
    page = context.new_page()
    lost: list[str] = []
    page.on("crash", lambda: lost.append("the page was lost"))
    open_app(page)
    page.wait_for_function("window.formvis.engine.memoryBudget > 0 && window.formvis.engine.undoStore", timeout=60000)

    page.evaluate("""async () => { const T = await import('/src/engine/types.ts'), e = window.formvis.engine; T.setPixelBudget(250_000_000);
      e.newDocument(15000, 10000, 'Large', 'white'); const r = e.current.doc.layers[0].raster;
      r.ctx.fillStyle = '#3366aa'; r.ctx.fillRect(2000, 1500, 9000, 6000); r.touch(); }""")
    assert page.evaluate("window.formvis.engine.current.doc.width") == 15000 and page.evaluate(WITHIN)

    # Painted: three brush strokes across the picture, each one step.
    steps = page.evaluate("window.formvis.engine.current.history.steps.names.length")
    page.evaluate("""() => { const e = window.formvis.engine; e.setTool('brush'); e.brush = { ...e.brush, diameter: 120, hardness: 0.7 }; e.setBrushMode('paint');
      for (let s = 0; s < 3; s++) { e.fg = { r: 200 - 60 * s, g: 40 + 70 * s, b: 90 }; e.beginStroke({ x: 600 + s * 4000, y: 800 }, false);
        for (let i = 1; i <= 30; i++) e.strokeTo({ x: 600 + s * 4000 + i * 100, y: 800 + i * 290 }); e.endStroke(); } }""")
    assert page.evaluate("window.formvis.engine.current.history.steps.names.length") == steps + 3
    assert page.evaluate(WITHIN)

    # Filtered: a Gaussian Blur over MCP, the path an agent takes; the old layer then goes to the undo store.
    page.evaluate("window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true }))")
    page.wait_for_timeout(600)
    result = _mcp("apply_filter", kind="gaussianBlur", settings={"radius": 8})
    assert not result.get("isError"), result
    assert page.evaluate("window.formvis.engine.current.history.peekUndo().name") == "Gaussian Blur"
    _until(page, "window.formvis.engine.current.history.peekUndo().before.doc.layers[0].raster.canvas.width === 0", 600)
    assert page.evaluate(WITHIN)

    # Saved to the library, closed, and reopened with the same pixels.
    before = page.evaluate(TILES)
    page.evaluate("() => { window.formvis.engine.current.libraryName = 'large-150mp'; window.formvis.commands.run('save'); }")
    _until(page, "Array.from(document.querySelectorAll('.cv-toast')).some((t) => t.textContent.includes('Saved large-150mp'))", 900)
    page.evaluate("() => { const e = window.formvis.engine; while (e.projects.length) e.closeProject(e.projects[0].id); }")
    page.evaluate("window.formvis.commands.run('recent-0')")
    _until(page, "!!window.formvis.engine.current && window.formvis.engine.current.libraryName === 'large-150mp' && window.formvis.engine.current.doc.layers[0].raster.width > 15000", 600)
    assert page.evaluate(TILES) == before
    assert page.evaluate(WITHIN)

    # Exported as PNG (in bands through the engine), the whole canvas.
    with page.expect_download(timeout=900000) as download:
        page.evaluate("window.formvis.commands.run('export-png')")
    png = tmp_path / "large.png"
    download.value.save_as(png)
    Image.MAX_IMAGE_PIXELS = None   # 150 MP is past Pillow's warning size, on purpose
    assert Image.open(png).size == (15000, 10000)
    assert not lost
