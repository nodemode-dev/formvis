SEL = """([start, value]) => { const s = [...document.querySelectorAll('select')].find((n) => n.getClientRects().length && [...n.options].some((o) => o.text.startsWith(start)));
  s.value = value; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }"""
SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
LAYER0 = "([x, y]) => window.formvis.engine.current.doc.layers[0].raster.ctx.getImageData(x, y, 1, 1).data[0]"


def open_filter(page, command):
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot").last.wait_for()
    page.wait_for_timeout(1200)


def ok(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)


def test_dither_ascii_replaces_mid_grey_with_black_glyph_marks_on_white_paper(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(120, 80, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(128,128,128)'; k.fillRect(0, 0, 120, 80); e.activeLayer.raster.touch(); e.refresh(); }""")
    open_filter(page, "filter-dither")
    page.evaluate(SEL, ["ASCII", "ascii"])
    page.wait_for_timeout(300)
    page.evaluate(SET, ["Pixel Size", 2])
    page.wait_for_timeout(500)
    ok(page)
    counts = page.evaluate("""() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 120, 80).data, s = {};
      for (let i = 0; i < d.length; i += 4) s[d[i]] = (s[d[i]] || 0) + 1; return s; }""")
    assert set(counts) == {"0", "255"}, counts
    assert 0 < counts["0"] < counts["255"], counts
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Dither"


def test_haze_by_depth_without_a_depth_picture_fades_the_top_of_the_frame_toward_the_haze_colour(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 100, 'H', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(0,0,0)'; k.fillRect(0, 0, 100, 100); e.activeLayer.raster.touch(); e.refresh(); }""")
    open_filter(page, "filter-haze")
    ok(page)
    top, mid, bottom = (page.evaluate(PX, [50, y]) for y in (2, 50, 97))
    assert top[2] > mid[2] > bottom[2] == 0, (top, mid, bottom)
    assert top[2] > top[0] > 0, top


def test_grain_plate_from_a_layer_pushes_pixels_by_the_plate_grey_levels(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(60, 60, 'G', 'white'); const b = e.activeLayer; b.raster.ctx.fillStyle = 'rgb(128,128,128)'; b.raster.ctx.fillRect(0, 0, 60, 60); b.raster.touch();
      const m = new E.Raster(60, 60); m.ctx.fillStyle = '#000'; m.ctx.fillRect(0, 0, 30, 60); m.ctx.fillStyle = '#fff'; m.ctx.fillRect(30, 0, 30, 60); m.touch();
      e.insertRasterLayer(m, 'Plate', 0, 0, {}, 'Test layer'); e.selectLayer(b.id); e.refresh(); }""")
    open_filter(page, "filter-grainPlate")
    page.locator(".cv-scrim:not([hidden]) select:has(option[value='file']):visible").first.select_option(label="Layer: Plate")
    page.wait_for_timeout(500)
    page.evaluate(SET, ["Amount (%)", 100])
    page.wait_for_timeout(500)
    ok(page)
    assert page.evaluate(LAYER0, [10, 30]) == 0
    assert page.evaluate(LAYER0, [50, 30]) == 255
