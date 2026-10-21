SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"


def test_glyph_click_appends_to_the_type_layer_and_lands_in_the_recent_row(page):
    # PC-EN-0420, PC-UI-0861
    page.evaluate("window.formvis.engine.newDocument(300, 300, 'T', 'white'); window.formvis.engine.setTool('type'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }")
    x, y = page.evaluate(SCR, [10, 10])
    x2, y2 = page.evaluate(SCR, [250, 120])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=5)
    page.mouse.up()
    ed = page.locator(".cv-type-editor")
    ed.fill("Hi")
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.current.activeLayer && window.formvis.engine.current.activeLayer.text")
    assert page.evaluate("window.formvis.commands.run('glyphs')")
    page.wait_for_timeout(1500)
    assert page.locator(".cv-glyph-grid button").count() == 256
    page.locator(".cv-glyph-grid button:visible", has_text="A").first.click()
    page.wait_for_function("window.formvis.engine.current.activeLayer.text.content === 'HiA'")
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Edit Type"
    assert page.evaluate("[...document.querySelectorAll('.cv-glyph-recent button:not([hidden])')].map((b) => b.textContent)")[0] == "A"
