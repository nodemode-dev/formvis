"""A giant document saved and reopened (1.62.8, DEV_PLAN 26.6). A 20,000 by 6,000 document (120 MP, kept in tiles) with a
painted background and a second layer painted with the brush is saved to the library through Save, closed, and opened
again from the recent list: both layers come back in tiles, every byte of what was painted equal, the background's base
colour kept, and untouched white made no tiles (a page of white would otherwise come back as a tile everywhere). Needs
the engine (it writes and reads giant layers a band at a time), and skips without it."""
import time
import urllib.request

import pytest


def _engine_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8190/api/version", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def test_a_giant_document_saves_and_reopens_exactly(page):
    if not _engine_up():
        pytest.skip("needs the engine on 8190")
    page.wait_for_function("window.formvis.engine.undoStore", timeout=30000)
    before = page.evaluate("""() => {
      const e = window.formvis.engine;
      window.__hash = (d) => { const u = new Uint32Array(d.buffer); let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; };
      e.newDocument(20000, 6000, 'Giant', 'white'); const bg = e.current.doc.layers[0].tiled;
      bg.drawOn(1500, 1500, 2600, 1300, (c) => { c.fillStyle = '#2050c0'; c.fillRect(1500, 1500, 2600, 1300); });
      e.addLayer({ name: 'Paint' });
      e.setTool('brush'); e.brush = { ...e.brush, diameter: 60, hardness: 0.8 }; e.setBrushMode('paint'); e.fg = { r: 200, g: 40, b: 90 };
      e.beginStroke({ x: 9000, y: 1800 }, false); for (let i = 1; i <= 30; i++) e.strokeTo({ x: 9000 + i * 100, y: 1800 + i * 17 }); e.endStroke();
      const paint = e.current.activeLayer.tiled;
      window.__regions = (l0, l1) => [window.__hash(l0.read(1000, 1000, 3600, 2300).data), window.__hash(l1.read(8500, 1500, 3800, 1100).data)];
      e.current.libraryName = 'giant-120mp'; window.formvis.commands.run('save');
      return { regions: window.__regions(bg, paint), bgTiles: bg.tileCount, paintTiles: paint.tileCount };
    }""")
    for _ in range(300):
        if page.evaluate("Array.from(document.querySelectorAll('.cv-toast')).some((t) => t.textContent.includes('Saved giant-120mp'))"):
            break
        time.sleep(0.5)
    page.evaluate("() => { const e = window.formvis.engine; while (e.projects.length) e.closeProject(e.projects[0].id); window.formvis.commands.run('recent-0'); }")
    page.wait_for_function("!!window.formvis.engine.current && window.formvis.engine.current.libraryName === 'giant-120mp' && window.formvis.engine.current.doc.layers.length === 2", timeout=300000)
    after = page.evaluate("""() => {
      const ls = window.formvis.engine.current.doc.layers, bg = ls[0].tiled, paint = ls[1].tiled;
      return { tiled: !!bg && !!paint, rasters: ls.some((l) => !!l.raster), base: bg ? bg.base : null, regions: bg && paint ? window.__regions(bg, paint) : null,
        bgTiles: bg ? bg.tileCount + bg.pagedCount : -1, paintTiles: paint ? paint.tileCount + paint.pagedCount : -1, grid: bg ? bg.cols * bg.rows : 0 };
    }""")
    assert after["tiled"] and not after["rasters"], after                   # both layers in tiles, never a full-size canvas
    assert after["base"] == [255, 255, 255, 255], after                     # the white base kept
    assert after["regions"] == before["regions"], (before, after)          # every byte of what was painted
    assert after["bgTiles"] <= before["bgTiles"] and after["bgTiles"] < after["grid"], (before, after)   # untouched white made no tiles
    assert after["paintTiles"] <= before["paintTiles"], (before, after)
