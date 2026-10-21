SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
INK = """() => { const e = window.formvis.engine; let n = 0;
  for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) { if (e.compositePixel({ x, y }).r < 100) n++; }
  return n; }"""
NAMES = "window.formvis.engine.historySteps.names.slice(-2)"


def test_character_style_resizes_its_linked_layer_and_clear_override_unlinks_it(page):
    # PC-EN-0411
    page.evaluate("window.formvis.engine.newDocument(300, 300, 'T', 'white'); window.formvis.engine.setTool('type'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.textSettings = { ...window.formvis.engine.textSettings, size: 24 }")
    x, y = page.evaluate(SCR, [10, 10])
    x2, y2 = page.evaluate(SCR, [250, 120])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=5)
    page.mouse.up()
    ed = page.locator(".cv-type-editor")
    ed.fill("Hello")
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.current.activeLayer && window.formvis.engine.current.activeLayer.text")
    base = page.evaluate(INK)
    assert base > 100
    assert page.evaluate("window.formvis.commands.run('character-styles')")
    page.wait_for_timeout(600)
    dlg = page.locator(".cv-scrim:not([hidden])")
    dlg.locator("input[placeholder='Style name']").fill("Big")
    dlg.locator("button", has_text="New Style").click()
    page.wait_for_function("window.formvis.engine.characterStyles.length === 1")
    assert page.evaluate("window.formvis.engine.characterStyles[0].name") == "Big"
    size = dlg.locator("input[aria-label=Size]")
    size.fill("72")
    size.press("Tab")
    page.wait_for_function(f"({INK})() > {base} * 4")
    assert page.evaluate("window.formvis.engine.characterStyles[0].size") == 72
    assert page.evaluate(NAMES)[-1] == "Character Style Options"
    dlg.locator("button", has_text="Clear Override").click()
    page.wait_for_function(f"({INK})() === {base}")
    assert page.evaluate(NAMES)[-1] == "Edit Type"
    dlg.locator("button", has_text="Apply").click()
    page.wait_for_function(f"({INK})() > {base} * 4")
