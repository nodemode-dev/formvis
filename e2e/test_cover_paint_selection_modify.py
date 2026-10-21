DLG = ".cv-scrim:not([hidden]) .cv-dialog"
SQ = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(200, 120, 'M', 'white');
  e.applySelection(E.SelectionMask.cropped(60, 40, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); }"""
BOUNDS = "(() => { const s = window.formvis.engine.current.selection; return [s.x, s.y, s.w, s.h]; })()"
VAL = "([x, y]) => { const s = window.formvis.engine.current.selection; return s ? s.valueAt(x, y) : 0; }"


def amount(page, command, value):
    page.evaluate(f"window.formvis.commands.run('{command}')")
    box = page.locator(DLG).locator("input").first
    box.wait_for()
    box.fill(str(value))
    box.press("Enter")
    page.wait_for_function("!document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')")


def test_expand_and_contract_take_their_typed_pixels_through_the_dialog(page):
    page.evaluate(SQ)
    amount(page, "expand", 6)
    assert page.evaluate(BOUNDS) == [54, 34, 52, 52]
    page.evaluate(SQ)
    amount(page, "contract", 5)
    assert page.evaluate(BOUNDS) == [65, 45, 30, 30]
    assert page.evaluate(VAL, [80, 60]) == 255 and page.evaluate(VAL, [62, 60]) == 0
    page.keyboard.press("Control+z")
    assert page.evaluate(BOUNDS) == [60, 40, 40, 40]


def test_smooth_rounds_the_corners_of_a_square_selection(page):
    page.evaluate(SQ)
    amount(page, "smooth", 8)
    assert page.evaluate(VAL, [60, 40]) == 0 and page.evaluate(VAL, [80, 60]) == 255
    assert page.evaluate(VAL, [60, 60]) == 255


def test_grow_takes_in_the_touching_pixels_of_a_similar_colour_only(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(200, 120, 'G', 'white');
      const c = e.activeLayer.raster.ctx; c.fillStyle = 'rgb(210,40,40)'; c.fillRect(0, 0, 100, 120); c.fillStyle = 'rgb(40,60,210)'; c.fillRect(100, 0, 100, 120); e.activeLayer.raster.touch();
      e.applySelection(E.SelectionMask.cropped(20, 20, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); }""")
    page.evaluate("window.formvis.commands.run('grow')")
    page.wait_for_function("window.formvis.engine.current.selection.valueAt(90, 100) > 0")
    assert page.evaluate(VAL, [5, 5]) > 0 and page.evaluate(VAL, [150, 60]) == 0


def test_view_mask_alone_shows_the_mask_in_black_and_white(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'K', 'white'); e.deselect(); e.fg = { r: 200, g: 30, b: 30 }; e.fill('fg'); e.addMask(false);
      e.setTool('brush'); e.setBrushMode('paint'); e.fg = { r: 0, g: 0, b: 0 }; e.setBrush({ diameter: 60, hardness: 1, opacity: 1 });
      e.beginStroke({ x: 10, y: 10 }, false, 1); for (let i = 1; i <= 20; i++) e.strokeTo({ x: 10 + i * 0.5, y: 10 + i * 2.5 }, 1); e.endStroke(); }""")
    seen = """([x, y]) => { const c = document.querySelector('.cv-stage .cv-scene'), v = window.formvis.engine.current.viewport, q = v.toScreen(x, y), d = c.width / c.clientWidth;
      return Array.from(c.getContext('2d').getImageData(Math.round(q.x * d), Math.round(q.y * d), 1, 1).data); }"""
    assert page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(75, 30, 1, 1).data[0]") == 200
    page.evaluate("window.formvis.commands.run('mask-view-alone')")
    page.wait_for_function("window.formvis.engine.maskView?.mode === 'alone'")
    page.wait_for_timeout(300)
    assert page.evaluate(seen, [25, 30])[:3] == [0, 0, 0] and page.evaluate(seen, [75, 30])[:3] == [255, 255, 255]
    page.evaluate("window.formvis.commands.run('mask-view-alone')")
    page.wait_for_timeout(300)
    assert page.evaluate(seen, [75, 30])[:3] == [200, 30, 30]
