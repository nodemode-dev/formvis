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


def test_600_megapixels_edited_whole(context, tmp_path):
    # 1.63.0, DEV_PLAN 26.6h, closing M5: a 30,000 by 20,000 document edited whole on the 4 GB test machine. Fine
    # stripes on every one of its 150 tiles (real pixels everywhere, which compress well, so the engine's disk holds
    # them: a photograph would need several GB free), a brush stroke on a second layer, a Gaussian Blur over the whole
    # background (every tile changed, its undo streamed to disk), undone and redone, saved to the library, reopened,
    # and exported; at each step the same recorded pixels checked exactly, and the memory budget never exceeded.
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (./formvis dev)")
    page = context.new_page()
    lost: list[str] = []
    page.on("crash", lambda: lost.append("the page was lost"))
    page.on("pageerror", lambda e: lost.append(f"page error: {e}"))
    open_app(page)
    page.wait_for_function("window.formvis.engine.undoStore", timeout=60000)
    t0 = time.time()
    step = lambda name: print(f"  {name}: {time.time() - t0:.0f} s", flush=True)
    page.evaluate("""async () => {
      const F = await import('/src/ui/panels/filter-panel.ts'), e = window.formvis.engine;
      window.__peak = 0; window.__check = () => { window.__peak = Math.max(window.__peak, e.memoryUse() / e.memoryBudget); };
      e.newDocument(30000, 20000, 'Giant', 'white'); const bg = e.current.doc.layers[0].tiled;
      const stripe = document.createElement('canvas'); stripe.width = 8; stripe.height = 1;
      const sc = stripe.getContext('2d'); sc.fillStyle = '#ffffff'; sc.fillRect(0, 0, 8, 1); sc.fillStyle = '#2050c0'; sc.fillRect(0, 0, 4, 1);
      for (let ty = 0; ty < bg.rows; ty++) {
        for (let tx = 0; tx < bg.cols; tx++) {
          const x = tx * bg.tile, y = ty * bg.tile, w = Math.min(bg.tile, bg.width - x), h = Math.min(bg.tile, bg.height - y);
          bg.drawOn(x, y, w, h, (c) => { c.fillStyle = c.createPattern(stripe, 'repeat'); c.fillRect(x, y, w, h); });
        }
        await e.pageTiles(); window.__check();
      }
      e.addLayer({ name: 'Paint' }); e.setTool('brush'); e.brush = { ...e.brush, diameter: 200, hardness: 0.7 }; e.setBrushMode('paint'); e.fg = { r: 230, g: 60, b: 40 };
      // Across several tiles (a stroke across nearly the whole picture can be cut on a small machine, and says so).
      window.__notes = []; e.on('notice', (n) => window.__notes.push(n.text));
      e.beginStroke({ x: 1500, y: 1700 }, false); for (let i = 1; i <= 30; i++) e.strokeTo({ x: 1500 + i * 200, y: 1700 + i * 100 }); e.endStroke();
      window.__layers = () => e.current.doc.layers.map((l) => l.tiled);
      window.__pts = [[5, 5], [2047, 2047], [2048, 2048], [14999, 9999], [2400, 2150], [12000, 9400], [29999, 19999], [20001, 4097]];
      window.__sample = async () => { const out = []; for (const t of window.__layers()) for (const [x, y] of window.__pts) { await t.ensure(x, y, 1, 1, e.undoStore); out.push(Array.from(t.read(x, y, 1, 1).data)); } await e.pageTiles(); window.__check(); return out; };
      window.__blur = async () => { const s = { ...F.defaultFilterSettings(), radius: 3 }; e.selectLayer(e.current.doc.layers[0].id); return e.bandedFilterTiled('Gaussian Blur', (src) => F.runFilter('gaussianBlur', s, 7, src, 1), F.bandApron('gaussianBlur', s)); };
      window.__settle = async (n) => { for (let i = 0; i < 20000 && (e.draining || e.current.history.steps.current !== n); i++) await new Promise((r) => setTimeout(r, 50)); };
    }""")
    step("striped all 150 tiles and painted a second layer")
    whole = page.evaluate("""async () => { const t = window.__layers()[1]; await t.ensure(7500, 4700, 1, 1, window.formvis.engine.undoStore);
      return { cut: window.__notes.filter((n) => n.startsWith('The stroke stopped')), endAlpha: t.read(7500, 4700, 1, 1).data[3] }; }""")
    assert not whole["cut"] and whole["endAlpha"] > 0, whole                 # the stroke whole, to its end
    s0 = page.evaluate("window.__sample()")
    assert page.evaluate("window.__blur()") is True
    s1 = page.evaluate("window.__sample()")
    assert s1[:8] != s0[:8]                                                   # the blur changed the stripes
    step("blurred the whole background")
    n = page.evaluate("window.formvis.engine.current.history.steps.current")
    page.evaluate(f"async () => {{ window.formvis.engine.undo(); await window.__settle({n - 1}); }}")
    assert page.evaluate("window.__sample()") == s0                           # undone, streamed from disk
    page.evaluate(f"async () => {{ window.formvis.engine.redo(); await window.__settle({n}); }}")
    assert page.evaluate("window.__sample()") == s1                           # and redone
    step("undone and redone")
    page.evaluate("() => { const e = window.formvis.engine; e.current.libraryName = 'giant-600mp'; window.formvis.commands.run('save'); }")
    _until(page, "Array.from(document.querySelectorAll('.cv-toast')).some((t) => t.textContent.includes('Saved giant-600mp'))", 3600)
    step("saved")
    page.evaluate("() => { const e = window.formvis.engine; while (e.projects.length) e.closeProject(e.projects[0].id); window.formvis.commands.run('recent-0'); }")
    _until(page, "!!window.formvis.engine.current && window.formvis.engine.current.libraryName === 'giant-600mp' && window.formvis.engine.current.doc.layers.length === 2", 3600)
    assert page.evaluate("window.__sample()") == s1                           # reopened as it was saved
    step("reopened")
    want = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine, s = E.createSurface(1, 1), c = E.ctxOf(s), out = [];
      for (const t of window.__layers()) for (const [x, y] of window.__pts) await t.ensure(x, y, 1, 1, e.undoStore);
      for (const [x, y] of window.__pts) { c.clearRect(0, 0, 1, 1); e.compose(s, [1, 0, 0, 1, -x, -y], 'high'); out.push(Array.from(c.getImageData(0, 0, 1, 1).data)); }
      return out;
    }""")
    with page.expect_download(timeout=3600000) as download:
        page.evaluate("window.formvis.commands.run('export-png')")
    png = tmp_path / "giant.png"
    download.value.save_as(png)
    pts = page.evaluate("window.__pts")
    w, h, rows = _png_rows(png, {y for _, y in pts})
    assert (w, h) == (30000, 20000)
    assert [list(rows[y][x * 4:x * 4 + 4]) for x, y in pts] == want            # the export, the composite exactly
    step("exported")
    peak = page.evaluate("window.__peak")
    print(f"  memory at its fullest: {peak * 100:.0f} percent of the budget", flush=True)
    assert peak <= 1.0, peak
    assert not lost, lost


def _png_rows(path, want: set) -> tuple:
    """A PNG (8-bit RGBA, filters None, Sub or Up) streamed a row at a time; {y: row} for the rows in `want`. A 600 MP
    picture is 2.4 GB decoded, more than the test machine can hold beside the browser."""
    import struct, zlib
    import numpy as np
    f = open(path, "rb")
    assert f.read(8) == b"\x89PNG\r\n\x1a\n"
    z, w = zlib.decompressobj(), 0
    buf, out, y, last, prev = b"", {}, 0, max(want), None
    while True:
        n, kind = struct.unpack(">I4s", f.read(8))
        data = f.read(n)
        f.read(4)
        if kind == b"IHDR":
            w, h = struct.unpack(">II", data[:8])
            prev = np.zeros(w * 4, np.int32)
        elif kind == b"IDAT":
            buf += z.decompress(data)
            while len(buf) >= w * 4 + 1 and y <= last:
                ft, raw = buf[0], np.frombuffer(buf[1:w * 4 + 1], np.uint8).astype(np.int32)
                buf = buf[w * 4 + 1:]
                if ft == 0:
                    row = raw
                elif ft == 2:
                    row = (raw + prev) & 255
                else:
                    assert ft == 1, f"filter {ft}"
                    row = raw.copy()
                    for i in range(4, w * 4):
                        row[i] = (row[i] + row[i - 4]) & 255
                if y in want:
                    out[y] = row.astype(np.uint8)
                prev, y = row, y + 1
            if y > last:
                return w, h, out
        elif kind == b"IEND":
            return w, h, out


def test_600_megapixels_export_with_tiles_on_disk(context, tmp_path):
    # 1.62.6, DEV_PLAN 26.6e: a giant document's PNG, its painted tiles sent to disk first, so each band must bring its
    # tiles back to be right (a tile on disk draws as its preview). About five minutes on the 4 GB test machine.
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (./formvis dev)")
    page = context.new_page()
    lost: list[str] = []
    page.on("crash", lambda: lost.append("the page was lost"))
    open_app(page)
    page.wait_for_function("window.formvis.engine.undoStore", timeout=60000)
    pts = [[100, 100], [3000, 3000], [1499, 2000], [1500, 2000], [21000, 13000], [22999, 14499], [23000, 14500], [9500, 6255], [29999, 19999]]
    r = page.evaluate("""async (pts) => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(30000, 20000, 'Giant', 'white'); const t = e.current.doc.layers[0].tiled;
      t.drawOn(1500, 1500, 4000, 3000, (c) => { c.fillStyle = '#2050c0'; c.fillRect(1500, 1500, 4000, 3000); });
      t.drawOn(20000, 12000, 3000, 2500, (c) => { c.fillStyle = '#c03020'; c.fillRect(20000, 12000, 3000, 2500); });
      e.setTool('brush'); e.brush = { ...e.brush, diameter: 80, hardness: 0.8 }; e.setBrushMode('paint'); e.fg = { r: 30, g: 160, b: 60 };
      e.beginStroke({ x: 8000, y: 6000 }, false); for (let i = 1; i <= 30; i++) e.strokeTo({ x: 8000 + i * 100, y: 6000 + i * 17 }); e.endStroke();
      const want = pts.map(([x, y]) => Array.from(t.read(x, y, 1, 1).data));
      e.tileShareOverride = 4 * 2048 * 2048 * 4;
      const far = E.createSurface(800, 600); e.compose(far, [1, 0, 0, 1, -25000, -2000], 'high');
      // Until the tiles fit their share: a round the stroke scheduled may be running, and pageTiles returns at once then.
      for (let i = 0; i < 100 && t.residentBytes > e.tileShareOverride; i++) { await e.pageTiles(); await new Promise((r) => setTimeout(r, 100)); }
      return { want, paged: t.pagedCount };
    }""", pts)
    assert r["paged"] >= 10, r                                                # the painted tiles on disk before the export
    with page.expect_download(timeout=1200000) as download:
        page.evaluate("window.formvis.commands.run('export-png')")
    png = tmp_path / "giant.png"
    download.value.save_as(png)
    w, h, rows = _png_rows(png, {y for _, y in pts})
    assert (w, h) == (30000, 20000)
    got = [list(rows[y][x * 4:x * 4 + 4]) for x, y in pts]
    assert got == r["want"], [(pts[i], r["want"][i], got[i]) for i in range(len(pts)) if got[i] != r["want"][i]]
    assert not lost
