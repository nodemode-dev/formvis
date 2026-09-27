SQUARE = """async () => {
  const e = window.sonny.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'L', 'transparent'); e.fg = { r: 220, g: 30, b: 30 };
  e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.setTool('brush'); e.setBrush({ diameter: 16, hardness: 1 }); e.setBrushMode('paint');
}"""
PX = "([x, y]) => Array.from(window.sonny.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"
STROKE = """(color) => { const e = window.sonny.engine; e.fg = color;
  const ok = e.beginStroke({ x: 20, y: 50 }, false, 1); if (ok) { for (let i = 1; i <= 16; i++) e.strokeTo({ x: 20 + i * 10, y: 50 }, 1); e.endStroke(); } return ok; }"""
NOTICES = """(() => { window.__notices = []; window.sonny.engine.on('notice', (n) => window.__notices.push(n.text)); })()"""


def lock(page, which):
    page.locator(f".cv-lock-btn[data-lock='{which}']").click()


def test_locked_pixels_refuse_painting_and_say_why(page):
    page.evaluate(SQUARE)
    page.evaluate(NOTICES)
    lock(page, "pixels")
    assert page.evaluate("window.sonny.engine.activeLayer.locks") == {"pixels": True}
    assert page.locator(".cv-lock-btn[data-lock='pixels']").get_attribute("aria-pressed") == "true"
    assert page.evaluate(STROKE, {"r": 0, "g": 0, "b": 255}) is False
    assert page.evaluate(PX, [100, 50])[:3] == [220, 30, 30]                           # unchanged
    notes = page.evaluate("window.__notices")
    assert notes and all("locked" in n for n in notes), notes                          # the lock's reason alone
    page.keyboard.press("Control+z")                                                   # one step
    assert page.evaluate("window.sonny.engine.activeLayer.locks ?? null") is None


def test_locked_position_refuses_moves(page):
    page.evaluate(SQUARE)
    x = page.evaluate("window.sonny.engine.activeLayer.transform.x")
    lock(page, "position")
    page.evaluate("window.sonny.engine.nudge(10, 0)")
    page.evaluate("window.sonny.engine.setLayerTransform({ x: 50 })")
    assert page.evaluate("window.sonny.engine.activeLayer.transform.x") == x
    lock(page, "position")                                                              # unlocked
    page.evaluate("window.sonny.engine.nudge(10, 0)")
    assert page.evaluate("window.sonny.engine.activeLayer.transform.x") == x + 10


def test_locked_transparency_paints_only_where_there_are_pixels(page):
    page.evaluate(SQUARE)
    lock(page, "transparency")
    assert page.evaluate(STROKE, {"r": 0, "g": 0, "b": 255}) is True
    assert page.evaluate(PX, [100, 50]) == [0, 0, 255, 255]                             # the square repainted
    assert page.evaluate(PX, [40, 50])[3] == 0                                          # the empty part stays empty
    # The Eraser may not make pixels transparent here: it paints the background colour, as Photoshop's.
    page.evaluate("window.sonny.engine.setColors(undefined, { r: 255, g: 255, b: 255 }); window.sonny.engine.setBrushMode('erase')")
    page.evaluate(STROKE, {"r": 0, "g": 0, "b": 0})
    assert page.evaluate(PX, [100, 50]) == [255, 255, 255, 255] and page.evaluate(PX, [40, 50])[3] == 0
