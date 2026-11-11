import pytest

SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
INK = """() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 300, 300).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] < 128) n++; }
  return n; }"""


def test_variable_axes_field_changes_the_weight_of_a_variable_face(page):
    # PC-EN-0400
    page.evaluate("window.formvis.engine.newDocument(300, 300, 'T', 'white'); window.formvis.engine.setTool('type'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.textSettings = { ...window.formvis.engine.textSettings, size: 48, family: 'Lora' }")
    x, y = page.evaluate(SCR, [10, 10])
    x2, y2 = page.evaluate(SCR, [290, 150])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=5)
    page.mouse.up()
    ed = page.locator(".cv-type-editor")
    ed.fill("Hamburg")
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.current.activeLayer && window.formvis.engine.current.activeLayer.text")
    ax = page.locator("input[aria-label='Variable axes']").first
    page.wait_for_timeout(1500)
    if "wght" not in (ax.get_attribute("placeholder") or ""):
        pytest.skip("no variable face installed on this machine")
    base = page.evaluate(INK)
    assert base > 300
    ax.fill("wght 700")
    ax.press("Tab")
    page.wait_for_function(f"({INK})() > {base} * 1.2", timeout=10000)
    assert page.evaluate("window.formvis.engine.current.activeLayer.text.variations") == {"wght": 700}
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Edit Type"
    ax.fill("wght 400")
    ax.press("Tab")
    page.wait_for_function(f"({INK})() === {base}", timeout=10000)
