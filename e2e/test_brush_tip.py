SHAPE = "({ a: window.formvis.engine.brushShape.angle, r: window.formvis.engine.brushShape.roundness })"


def test_the_tip_handles_turn_and_flatten_the_brush(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'T', 'white')")
    tip = page.locator(".cv-props-col .cv-brush-tip")
    b = tip.bounding_box()
    cx, cy, R = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, b["width"] * 0.36
    page.mouse.move(cx + R, cy); page.mouse.down(); page.mouse.move(cx, cy - R, steps=6); page.mouse.up()   # right handle, up
    assert abs(page.evaluate(SHAPE)["a"] - 90) <= 3, page.evaluate(SHAPE)
    page.evaluate("window.formvis.engine.brushShape = { ...window.formvis.engine.brushShape, angle: 0, roundness: 100 }; window.formvis.engine.emit('options', null)")
    page.mouse.move(cx, cy - R); page.mouse.down(); page.mouse.move(cx, cy - R * 0.4, steps=6); page.mouse.up()  # top handle, in
    got = page.evaluate(SHAPE)
    assert got["a"] == 0 and 30 <= got["r"] <= 50, got


def test_a_preset_brings_its_shape_and_the_next_one_its_own(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'P', 'white')")
    page.locator(".cv-props-col .cv-brush-tile[aria-label='Flat angled']").click()
    assert page.evaluate(SHAPE) == {"a": -35, "r": 14}
    page.locator(".cv-props-col .cv-brush-tile[aria-label='Hard round']").click()
    assert page.evaluate(SHAPE) == {"a": 0, "r": 100}                                   # nothing lingers


def test_a_menu_has_a_tick_column_only_where_a_tick_can_show(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'M', 'white')")
    page.locator(".cv-menu-btn", has_text="Filter").click()
    assert page.evaluate("[...document.querySelectorAll('.cv-menu')].find((m) => !m.hidden).classList.contains('has-checks')") is False
    page.keyboard.press("Escape")
    page.locator(".cv-menu-btn", has_text="Window").click()
    assert page.evaluate("[...document.querySelectorAll('.cv-menu')].find((m) => !m.hidden).classList.contains('has-checks')") is True
    page.keyboard.press("Escape")
