SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
INK = """() => { const e = window.formvis.engine; let n = 0;
  for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) { if (e.compositePixel({ x, y }).r < 100) n++; }
  return n; }"""


def test_hyphenate_checkbox_breaks_a_long_word_in_paragraph_text_with_a_hyphen(page):
    # PC-EN-0403
    page.evaluate("window.formvis.engine.newDocument(300, 300, 'T', 'white'); window.formvis.engine.setTool('type'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.textSettings = { ...window.formvis.engine.textSettings, size: 24 }")
    x, y = page.evaluate(SCR, [10, 10])
    x2, y2 = page.evaluate(SCR, [130, 250])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=5)
    page.mouse.up()
    ed = page.locator(".cv-type-editor")
    ed.fill("Internationalization extraordinary")
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.current.activeLayer && window.formvis.engine.current.activeLayer.text")
    assert not page.evaluate("window.formvis.engine.current.activeLayer.text.hyphenate")
    before = page.evaluate(INK)
    page.locator("input[aria-label=Hyphenate]").first.check()
    page.wait_for_function("window.formvis.engine.current.activeLayer.text.hyphenate === true")
    page.wait_for_function(f"({INK})() !== {before}")
    assert page.evaluate(INK) > before + 15
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Edit Type"
    page.evaluate("window.formvis.engine.undo()")
    page.wait_for_function(f"({INK})() === {before}")
