import json

# One stroke (or a single dab when `to` is null) with `shape` on a fresh transparent layer; the paint's bounding box
# (pixels over half coverage) and its total coverage.
PAINT = """async ([shape, from, to, pose]) => {
  const E = await import('/src/engine/index.ts'), B = await import('/src/engine/brush-dynamics.ts'), e = window.sonny.engine;
  e.newDocument(200, 200, 'B', 'white'); e.addLayer(); const l = e.current.activeLayer; l.raster = new E.Raster(200, 200);
  e.brush = { diameter: 40, hardness: 1, opacity: 1 }; e.brushFlow = 1; e.brushDynamics = B.noDynamics();
  e.fg = { r: 0, g: 0, b: 0 };
  e.brushShape = { ...B.defaultShape(), ...shape, texture: { ...B.defaultShape().texture, ...(shape.texture || {}) }, dual: { ...B.defaultShape().dual, ...(shape.dual || {}) } };
  if (e.brushShape.texture.on && !e.brushShape.texture.pattern) e.brushShape.texture.pattern = E.allPatterns()[0].id;
  e.beginStroke(from, false, 1, pose || undefined);
  if (to) e.strokeTo(to, 1, pose || undefined);
  e.endStroke();
  const d = e.current.activeLayer.raster.ctx.getImageData(0, 0, 200, 200).data;
  let x0 = 200, y0 = 200, x1 = -1, y1 = -1, sum = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { const a = d[(y * 200 + x) * 4 + 3]; sum += a; if (a > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  let hash = 0; for (let i = 3; i < d.length; i += 4) hash = (hash * 31 + d[i]) >>> 0;
  e.brushShape = B.defaultShape();
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, sum, hash };
}"""
C = {"x": 100, "y": 100}


def paint(page, shape=None, to=None, pose=None, frm=C):
    return page.evaluate(PAINT, [shape or {}, frm, to, pose])


def test_the_plain_round_dab_stays_round(page):
    r = paint(page)
    assert abs(r["w"] - 40) <= 2 and abs(r["h"] - 40) <= 2, r


def test_roundness_flattens_the_tip_and_angle_turns_it(page):
    flat = paint(page, {"roundness": 25})
    assert abs(flat["w"] - 40) <= 2 and abs(flat["h"] - 10) <= 2, flat
    upright = paint(page, {"roundness": 25, "angle": 90})
    assert abs(upright["w"] - 10) <= 2 and abs(upright["h"] - 40) <= 2, upright


def test_pen_tilt_turns_the_tip(page):
    forward = paint(page, {"roundness": 25, "angleControl": "tilt"}, pose={"tiltX": 0, "tiltY": 60, "twist": 0})
    sideways = paint(page, {"roundness": 25, "angleControl": "tilt"}, pose={"tiltX": 60, "tiltY": 0, "twist": 0})
    assert forward["h"] > forward["w"] * 2 and sideways["w"] > sideways["h"] * 2, (forward, sideways)


def test_scattering_spreads_the_paint(page):
    r = paint(page, {"scatter": 150, "bothAxes": True, "count": 8})
    assert r["w"] > 70 and r["h"] > 70, r


def test_texture_and_dual_brush_cut_into_the_paint(page):
    plain = paint(page, to={"x": 160, "y": 100}, frm={"x": 40, "y": 100})
    tex = paint(page, {"texture": {"on": True, "depth": 100}}, to={"x": 160, "y": 100}, frm={"x": 40, "y": 100})
    dual = paint(page, {"dual": {"on": True, "diameter": 8, "scatter": 150, "count": 2}}, to={"x": 160, "y": 100}, frm={"x": 40, "y": 100})
    assert tex["sum"] < plain["sum"] * 0.9 and dual["sum"] < plain["sum"] * 0.7, (plain["sum"], tex["sum"], dual["sum"])


def test_a_jittered_stroke_is_laid_the_same_way_each_time(page):
    shape = {"sizeJitter": 60, "angleJitter": 50, "roundness": 40, "scatter": 80, "count": 3}
    a = paint(page, shape, to={"x": 170, "y": 60}, frm={"x": 30, "y": 140})
    b = paint(page, shape, to={"x": 170, "y": 60}, frm={"x": 30, "y": 140})
    assert a["hash"] == b["hash"] and a["sum"] == b["sum"], (a, b)


def test_brush_settings_opens_with_its_sections_and_edits_the_brush(page):
    assert page.evaluate("window.sonny.commands.run('brush-settings')")
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    heads = dlg.locator("h3").all_inner_texts()
    assert heads == ["Brush Tip Shape", "Shape Dynamics", "Scattering", "Texture", "Dual Brush", "Color Dynamics", "Transfer", "Noise and Wet Edges"], heads
    slider = dlg.locator(".cv-field").filter(has=page.get_by_text("Roundness (%)", exact=True)).locator("input[type=range]")
    slider.evaluate("(i) => { i.value = '30'; i.dispatchEvent(new Event('input', { bubbles: true })); }")
    assert page.evaluate("window.sonny.engine.brushShape.roundness") == 30
    dlg.locator(".cv-dialog-foot button", has_text="Reset").click()
    assert page.evaluate("window.sonny.engine.brushShape.roundness") == 100
    page.keyboard.press("Escape")
