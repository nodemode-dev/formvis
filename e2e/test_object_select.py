import pytest

SCENE = """() => { const e = window.formvis.engine; e.newDocument(320, 240, 'O', 'white'); const c = e.current.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 320, 240);
  c.fillStyle = 'rgb(220,40,40)'; c.beginPath(); c.arc(80, 120, 50, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgb(40,60,220)'; c.fillRect(195, 75, 91, 91); e.current.activeLayer.raster.touch(); e.setTool('objectSelect'); }"""
SCREEN = """() => { const e = window.formvis.engine, v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect();
  return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
COVER = """() => { const s = window.formvis.engine.current.selection; if (!s) return null;
  let ci = 0, cn = 0, si = 0, sn = 0;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) { const v = s.valueAt(x, y) >= 128;
    if ((x - 80) ** 2 + (y - 120) ** 2 <= 2500) { cn++; ci += v; } else if (x >= 195 && x <= 285 && y >= 75 && y <= 165) { sn++; si += v; } }
  return { circle: ci / cn, square: si / sn }; }"""


def available(page):
    return page.evaluate("fetch('/api/capabilities').then((r) => r.json()).then((c) => !!c.selectObject?.available)")


def test_clicking_selects_the_object_and_shift_adds_another(page):
    if not available(page):
        pytest.skip("SAM 2.1 is optional: ./formvis install-ml installs torch and sam2")
    page.evaluate(SCENE)
    x0, y0, z = page.evaluate(SCREEN)
    page.mouse.click(x0 + 80 * z, y0 + 120 * z)
    page.wait_for_function("!!window.formvis.engine.current.selection", timeout=60000)
    c = page.evaluate(COVER)
    assert c["circle"] > 0.95 and c["square"] < 0.02, c                  # the circle, and only the circle
    page.keyboard.down("Shift")
    page.mouse.click(x0 + 240 * z, y0 + 120 * z)
    page.keyboard.up("Shift")
    page.wait_for_function(f"(() => {{ const f = {COVER}; const c = f(); return c && c.square > 0.95; }})()", timeout=30000)
    c = page.evaluate(COVER)
    assert c["circle"] > 0.95 and c["square"] > 0.95, c                  # Shift added the square
    page.evaluate("window.formvis.engine.undo()")
    c = page.evaluate(COVER)
    assert c["circle"] > 0.95 and c["square"] < 0.02, c                  # one undo takes the square back off


def test_a_box_selects_the_object_in_it_and_resting_shows_the_object_first(page):
    # Box mode and the hover highlight (1.49.10), against the real model.
    if not available(page):
        pytest.skip("SAM 2.1 is optional: ./formvis install-ml installs torch and sam2")
    page.evaluate(SCENE)
    x0, y0, z = page.evaluate(SCREEN)
    # Resting over the square shows it, tinted, before any click: no selection is made.
    page.mouse.move(x0 + 240 * z, y0 + 120 * z); page.mouse.move(x0 + 241 * z, y0 + 121 * z)
    # The object's outline in the accent (its edge) and a light wash inside, as Photoshop marks it (1.50.1).
    page.wait_for_function("""(() => { const o = document.querySelector('.cv-overlay-canvas'), g = o.getContext('2d'), v = window.formvis.engine.current.viewport, d = o.width / o.clientWidth;
      const at = (x, y) => { const q = v.toScreen(x, y); return g.getImageData(Math.round(q.x * d), Math.round(q.y * d), 1, 1).data; };
      const edge = at(196, 120), inside = at(240, 120); return edge[3] > 200 && edge[0] > edge[2] + 80 && inside[3] > 20 && inside[3] < 90; })()""", timeout=60000)
    assert page.evaluate("window.formvis.engine.current.selection") is None                # shown, not selected
    # A box round the circle selects it.
    page.mouse.move(x0 + 20 * z, y0 + 60 * z); page.mouse.down(); page.mouse.move(x0 + 140 * z, y0 + 180 * z, steps=8); page.mouse.up()
    page.wait_for_function("!!window.formvis.engine.current.selection", timeout=60000)
    c = page.evaluate(COVER)
    assert c["circle"] > 0.95 and c["square"] < 0.02, c
