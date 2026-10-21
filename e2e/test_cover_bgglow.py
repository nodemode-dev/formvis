BG = {"r": 20, "g": 120, "b": 220}
LP = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SET = """([label, v]) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""


def setup(page):
    page.evaluate("""(bg) => { const e = window.formvis.engine; e.newDocument(200, 150, 'B', 'white'); e.setColors({ r: 0, g: 0, b: 0 }, bg);
      const k = e.activeLayer.raster.ctx; k.fillStyle = 'rgb(200,30,30)'; k.fillRect(40, 40, 60, 60); e.activeLayer.raster.touch(); e.refresh(); }""", BG)


def selection(page):
    return page.evaluate("(() => { const s = window.formvis.engine.current.selection; return s ? [s.rect.x, s.rect.y, s.rect.w, s.rect.h] : null; })()")


def drag(page, x0, y0, x1, y1):
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=4)
    page.mouse.move(x1, y1, steps=6)
    page.mouse.up()
    page.wait_for_timeout(300)


def calibrate(page):
    page.keyboard.press("m")
    page.wait_for_timeout(200)
    drag(page, 200, 200, 800, 600)
    r = selection(page)
    z = 600 / r[2]
    x0, y0 = 200 - r[0] * z, 200 - r[1] * z
    page.keyboard.press("Control+d")
    page.wait_for_timeout(200)
    return lambda dx, dy: (x0 + dx * z, y0 + dy * z)


def select_block(page, at):
    page.keyboard.press("m")
    page.wait_for_timeout(150)
    (x0, y0), (x1, y1) = at(40, 40), at(100, 100)
    drag(page, x0, y0, x1, y1)


def move_right(page, at):
    page.keyboard.press("v")
    page.wait_for_timeout(200)
    (sx, sy), (mx, my), (ex, ey) = at(70, 70), at(85, 75), at(100, 70)
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(mx, my, steps=5)
    page.mouse.move(ex, ey, steps=5)
    page.mouse.up()
    page.wait_for_timeout(400)


def names(page):
    return page.evaluate("window.formvis.engine.historySteps")


def test_moving_a_selection_on_the_background_fills_the_vacated_area_with_the_background_colour(page):
    setup(page)
    at = calibrate(page)
    select_block(page, at)
    before = len(names(page)["names"])
    move_right(page, at)
    assert names(page)["names"][before:] == ["Move Pixels"]
    assert page.evaluate(LP, [45, 45]) == [20, 120, 220, 255]
    assert page.evaluate(LP, [125, 55]) == [200, 30, 30, 255]
    assert page.evaluate(LP, [5, 5]) == [255, 255, 255, 255]
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    assert page.evaluate(LP, [45, 45]) == [200, 30, 30, 255]
    assert page.evaluate(LP, [125, 55]) == [255, 255, 255, 255]


def test_floating_the_selection_and_moving_it_on_the_background_fills_with_the_background_colour(page):
    setup(page)
    at = calibrate(page)
    select_block(page, at)
    before = len(names(page)["names"])
    assert page.evaluate("window.formvis.commands.run('select-float')")
    page.wait_for_timeout(300)
    move_right(page, at)
    page.keyboard.press("Enter")
    page.wait_for_timeout(600)
    assert names(page)["names"][before:] == ["Transform Selection"]
    assert page.evaluate(LP, [45, 45]) == [20, 120, 220, 255]
    assert page.evaluate(LP, [125, 55]) == [200, 30, 30, 255]
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    assert page.evaluate(LP, [45, 45]) == [200, 30, 30, 255]
    assert page.evaluate(LP, [125, 55]) == [255, 255, 255, 255]


def test_delete_backspace_and_cut_on_the_background_fill_with_the_background_colour(page):
    # PC-UI-0064, PC-EN-0526, PC-EN-0533
    setup(page)
    at = calibrate(page)
    for key in ("Delete", "Backspace", "Control+x"):
        setup(page)
        select_block(page, at)
        before = len(names(page)["names"])
        page.keyboard.press(key)
        page.wait_for_timeout(500)
        assert len(names(page)["names"]) - before == 1, key
        assert page.evaluate(LP, [60, 60]) == [20, 120, 220, 255], key
        assert page.evaluate(LP, [5, 5]) == [255, 255, 255, 255], key
        page.keyboard.press("Control+z")
        page.wait_for_timeout(300)
        assert page.evaluate(LP, [60, 60]) == [200, 30, 30, 255], key


def test_moving_and_clearing_on_a_normal_layer_keep_transparency(page):
    setup(page)
    at = calibrate(page)
    assert page.evaluate("window.formvis.commands.run('duplicate')")
    page.wait_for_timeout(300)
    assert page.evaluate("window.formvis.engine.activeLayer.name") == "Background copy"
    select_block(page, at)
    move_right(page, at)
    assert page.evaluate(LP, [45, 45]) == [0, 0, 0, 0]
    assert page.evaluate(LP, [125, 55]) == [200, 30, 30, 255]
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    page.keyboard.press("Delete")
    page.wait_for_timeout(300)
    assert page.evaluate(LP, [60, 60]) == [0, 0, 0, 0]


def glow_dialog(page, sets):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'G', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(20,20,20)'; k.fillRect(0, 0, 100, 60); k.fillStyle = 'rgb(250,230,200)'; k.fillRect(45, 25, 10, 10); e.activeLayer.raster.touch(); e.refresh(); }""")
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_timeout(1500)
    for label, value in sets:
        page.evaluate(SET, [label, value])
    page.wait_for_timeout(1500)
    page.locator("button.cv-btn-primary", has_text="OK").last.click()
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Develop'", timeout=10000)
    page.wait_for_timeout(800)


def test_develop_effects_glow_blooms_the_highlights_into_the_dark_and_undoes(page):
    # CO-0157
    glow_dialog(page, [("Glow", 80), ("Glow radius (px)", 12), ("Glow threshold", 50)])
    near, far = page.evaluate(PX, [40, 30]), page.evaluate(PX, [70, 30])
    assert near[0] > 40 and near[0] - 20 > 3 * (far[0] - 20), (near, far)
    assert page.evaluate(PX, [50, 30])[0] > 250
    page.keyboard.press("Control+z")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [40, 30])[:3] == [20, 20, 20]


def test_develop_effects_glow_warmth_turns_the_bloom_red_over_blue(page):
    # CO-0157
    glow_dialog(page, [("Glow", 80), ("Glow radius (px)", 12), ("Glow threshold", 50), ("Glow warmth", 100)])
    r, g, b, _ = page.evaluate(PX, [40, 30])
    assert r - 20 > b - 20 + 4, (r, g, b)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    glow_dialog(page, [("Glow", 80), ("Glow radius (px)", 12), ("Glow threshold", 50), ("Glow warmth", -100)])
    r2, g2, b2, _ = page.evaluate(PX, [40, 30])
    assert b2 > b and r2 < r, ((r, b), (r2, b2))
