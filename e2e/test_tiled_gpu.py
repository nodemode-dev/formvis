"""A giant document on the GPU, a texture per tile (1.62.9, DEV_PLAN 26.6g). On a 20,000 by 6,000 document (120 MP, kept
in tiles), a blue rectangle across tile edges and a brush stroke on a second layer at 70 percent in Multiply, the GPU's
drawing of a view (WebGL2, through the bench's renderToPixels) is held to the bench's bar against the CPU's: at actual
size where four tiles meet, and at an eighth (reduced copies of the tiles), within 4 levels; the whole document needs
under 4 MB of textures (sixteenth-size copies); tiles on disk are asked back by a GPU frame and then drawn equal; and the
window's own display draws the document on the GPU. Skips where the browser has no WebGL2."""
import pytest

SETUP = """async () => {
  const e = window.formvis.engine;
  e.newDocument(20000, 6000, 'Giant', 'white'); const bg = e.current.doc.layers[0].tiled;
  bg.drawOn(1500, 1500, 2600, 1300, (c) => { c.fillStyle = '#2050c0'; c.fillRect(1500, 1500, 2600, 1300); });
  e.addLayer({ name: 'Paint' }); e.setTool('brush'); e.brush = { ...e.brush, diameter: 120, hardness: 0.6 }; e.setBrushMode('paint'); e.fg = { r: 220, g: 120, b: 40 };
  e.beginStroke({ x: 1700, y: 1900 }, false); for (let i = 1; i <= 30; i++) e.strokeTo({ x: 1700 + i * 30, y: 1900 + i * 10 }); e.endStroke();
  const pl = e.current.activeLayer; e.current.updateLayer(pl.id, { opacity: 0.7, blend: 'multiply' });
  window.__tiles = [bg, e.current.layer(pl.id).tiled];
}"""

COMPARE = """async ([view, Wv, Hv]) => {
  const E = await import('/src/engine/index.ts'), { GlDisplay } = await import('/src/gpu/gl-display.ts'), e = window.formvis.engine;
  const gl = GlDisplay.create(document.createElement('canvas'));
  if (!gl) return { gl: false };
  try {
    const s = E.createSurface(Wv, Hv), c = E.ctxOf(s); c.fillStyle = '#fff'; c.fillRect(0, 0, Wv, Hv); e.compose(s, view, 'high');
    const cpu = c.getImageData(0, 0, Wv, Hv).data, g = e.gpuLayers({ matrix: view, width: Wv, height: Hv });
    if (!('layers' in g)) return { gl: true, reason: g.reason };
    const px = await gl.renderToPixels(g.layers, view, view[0], [0, 0, Wv, Hv], { a: [255, 255, 255], b: [204, 204, 204], cell: 8, origin: [0, 0] }, Wv, Hv);
    let m = 0, n = 0, w4 = 0;
    for (let i = 0; i < cpu.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(cpu[i + k] - px[i + k]); m = Math.max(m, d); n++; if (d <= 4) w4++; }
    const bytes = g.layers.reduce((a, l) => a + (l.image ? l.image.width * l.image.height * 4 : 0), 0);
    return { gl: true, specs: g.layers.length, textureMB: bytes / 1048576, maxDiff: m, within4: w4 / n };
  } finally { gl.destroy(); }
}"""


def test_a_giant_document_draws_on_the_gpu_per_tile_as_the_cpu_does(page):
    page.evaluate(SETUP)
    actual = page.evaluate(COMPARE, [[1, 0, 0, 1, -1900, -1800], 560, 400])
    if not actual["gl"]:
        pytest.skip("no WebGL2 in this browser")
    assert "reason" not in actual, actual
    assert actual["maxDiff"] <= 4, actual                                    # where four tiles meet, both layers
    eighth = page.evaluate(COMPARE, [[0.125, 0, 0, 0.125, -100, -150], 560, 400])
    assert eighth["within4"] >= 0.99, eighth                                # reduced copies of the tiles
    whole = page.evaluate(COMPARE, [[0.028, 0, 0, 0.028, 0, 0], 560, 168])
    assert whole["textureMB"] < 4 and whole["within4"] >= 0.99, whole       # the whole document in under 4 MB of textures
    # Tiles on disk: a GPU frame shows their previews and asks for them; once back, drawn equal again.
    paged = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine, ts = window.__tiles;
      e.tileShareOverride = 1; e.compose(E.createSurface(64, 64), [1, 0, 0, 1, -18000, -5000], 'high');
      for (let i = 0; i < 50 && ts[0].stateOf(0) !== 'paged'; i++) { await e.pageTiles(); await new Promise((r) => setTimeout(r, 50)); }
      const before = ts[0].stateOf(0); e.tileShareOverride = null;
      const keys = [0, 1, ts[0].cols, ts[0].cols + 1];   // the four tiles the view sees
      for (let i = 0; i < 200 && keys.some((k) => ts.some((t) => t.stateOf(k) === 'paged')); i++) {
        e.gpuLayers({ matrix: [1, 0, 0, 1, -1900, -1800], width: 560, height: 400 }); await new Promise((r) => setTimeout(r, 50));
      }
      return { before, after: keys.map((k) => ts.map((t) => t.stateOf(k)).join('/')) };
    }""")
    assert paged["before"] == "paged" and not any("paged" in s for s in paged["after"]), paged
    again = page.evaluate(COMPARE, [[1, 0, 0, 1, -1900, -1800], 560, 400])
    assert again["maxDiff"] <= 4, again


def test_the_window_draws_a_giant_document_on_the_gpu(page):
    # Its own test, so that where the window's display has no GPU (this skips) the comparisons above still report.
    # The stage logs only when its reason changes, so its shown GPU canvas, not the console, says which display drew.
    notes: list[str] = []
    page.on("console", lambda m: notes.append(m.text))
    page.evaluate(SETUP)
    shown = "Array.from(document.querySelectorAll('.cv-scene-gpu')).some((c) => !c.hidden)"
    page.wait_for_timeout(500)
    if not page.evaluate(shown):
        page.evaluate("() => window.formvis.engine.newDocument(800, 600, 'Small', 'white')")
        page.wait_for_timeout(500)
        if not page.evaluate(shown):
            pytest.skip("the window's display has no GPU in this browser")
        raise AssertionError(f"an ordinary document drew on the GPU and the giant one did not: {notes[-3:]}")
