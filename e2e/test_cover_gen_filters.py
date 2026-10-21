# Displace with a map layer, Adaptive Wide Angle on a picture with straight lines, and Vanishing Point with a plane and a
# pasted layer, each driven through its dialog. PC-EN-0263, PC-UI-0446, PC-EN-0370, PC-UI-0426, PC-UI-0933, PC-EN-0371,
# PC-UI-0429, PC-UI-0932.
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
ROW = "([y, w]) => { const d = window.formvis.engine.activeLayer.raster.ctx.getImageData(0, y, w, 1).data; return Array.from({ length: w }, (_, i) => d[i * 4]); }"
FIRST_DARK = """() => { const d = window.formvis.engine.activeLayer.raster.ctx.getImageData(0, 0, 200, 120).data; const ys = [];
  for (const x of [10, 100, 190]) { for (let y = 0; y < 120; y++) if (d[(y * 200 + x) * 4] < 100) { ys.push(y); break; } } return ys; }"""


def displace_with(page, red):
    page.evaluate("""async (red) => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(100, 60, 'D', 'white'); const base = e.activeLayer; const k = base.raster.ctx; k.fillStyle = '#000'; k.fillRect(45, 0, 10, 60); base.raster.touch();
      const m = new E.Raster(100, 60); m.ctx.fillStyle = `rgb(${red},128,0)`; m.ctx.fillRect(0, 0, 100, 60); m.touch();
      e.insertRasterLayer(m, 'Map', 0, 0, {}, 'Test layer'); e.selectLayer(base.id); e.refresh(); }""", red)
    assert page.evaluate("window.formvis.commands.run('filter-displace')")
    d = page.locator(DLG).last
    d.wait_for()
    page.wait_for_timeout(600)
    options = d.locator("select").evaluate_all("(s) => s.map((x) => [...x.options].map((o) => o.value))")
    which = next(i for i, o in enumerate(options) if any(v.startswith("layer:") for v in o))
    d.locator("select").nth(which).select_option(label="Layer: Map")
    page.wait_for_timeout(600)
    page.evaluate(SET, ["Horizontal Scale (%)", 20])
    page.wait_for_timeout(600)
    d.locator(".cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1200)
    row = page.evaluate(ROW, [30, 100])
    dark = [i for i, v in enumerate(row) if v < 128]
    return dark[0], dark[-1]


def test_displace_with_a_red_map_layer_moves_a_stripe_right(page):
    start, end = displace_with(page, 255)
    assert start > 45 and end - start == 9


def test_displace_with_a_black_red_map_layer_moves_a_stripe_left(page):
    start, end = displace_with(page, 0)
    assert start < 45 and end - start == 9


def test_wide_angle_fit_to_lines_and_strength_bend_a_straight_line(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 120, 'W', 'white'); const k = e.activeLayer.raster.ctx; k.fillStyle = '#000';
      k.fillRect(0, 20, 200, 3); k.fillRect(0, 95, 200, 3); k.fillRect(60, 0, 3, 120); e.activeLayer.raster.touch(); e.refresh(); }""")
    before = page.evaluate(FIRST_DARK)
    assert before == [20, 20, 20]
    page.evaluate("window.formvis.commands.run('filter-wide-angle')")
    d = page.locator(DLG, has_text="Adaptive Wide Angle").last
    d.wait_for()
    page.wait_for_timeout(500)
    cv = d.locator("canvas").first.bounding_box()
    for x in (20, 100, 180):
        page.mouse.click(cv["x"] + x * 2, cv["y"] + 5 + 21 * 2)
    assert "1 line ready" in d.locator(".cv-dialog-note").inner_text()
    d.get_by_role("button", name="Fit to lines").click()
    assert "Field of view" in d.locator(".cv-dialog-note").inner_text()
    page.evaluate(SET, ["Strength (field of view)", 70])
    page.wait_for_timeout(500)
    d.locator(".cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1500)
    after = page.evaluate(FIRST_DARK)
    assert after != before
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Adaptive Wide Angle"


def test_vanishing_point_plane_and_paste_change_the_layer_in_one_step(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(300, 200, 'V', 'white'); const base = e.activeLayer; const k = base.raster.ctx; k.fillStyle = '#2060c0'; k.fillRect(50, 50, 200, 100); base.raster.touch();
      const m = new E.Raster(300, 200); m.ctx.fillStyle = 'rgb(255,0,0)'; m.ctx.fillRect(0, 0, 300, 200); m.touch();
      e.insertRasterLayer(m, 'Patch', 0, 0, {}, 'Test layer'); e.selectLayer(base.id); e.refresh(); }""")
    page.evaluate("window.formvis.commands.run('filter-vanishing-point')")
    d = page.locator(DLG, has_text="Vanishing Point").last
    d.wait_for()
    page.wait_for_timeout(500)
    cv = d.locator("canvas").first.bounding_box()
    for x, y in ((50, 50), (250, 50), (250, 150), (50, 150)):
        page.mouse.click(cv["x"] + 210 + x, cv["y"] + 140 + y)
    assert d.locator("select").first.evaluate("(s) => [...s.options].map((o) => o.textContent)") == ["Plane 1"]
    d.get_by_role("button", name="Paste", exact=True).click()
    page.wait_for_timeout(600)
    d.locator(".cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1500)
    centre, outside = page.evaluate("() => [[150, 100], [10, 10]].map(([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data))")
    assert centre[0] > 200 and centre[2] < 80
    assert outside == [255, 255, 255, 255]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Vanishing Point"
