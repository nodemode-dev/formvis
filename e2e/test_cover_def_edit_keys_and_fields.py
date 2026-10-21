# Return applies and Escape cancels a pending transform; the arrow keys step a numeric options-bar field.
import re

DOC = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 200, 'M', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(50, 50, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.setTool('move'); }"""


def start_transform(page):
    page.evaluate(DOC)
    page.wait_for_function("window.formvis.engine.tool === 'move'", timeout=5000)
    page.evaluate("window.formvis.commands.run('transform')")
    page.wait_for_function("!!window.formvis.engine.transformEdit", timeout=5000)


def field(page, label):
    return page.locator("label.cv-opt", has=page.locator("span:first-child", has_text=re.compile(f"^{label}$"))).locator("input").first


def test_escape_cancels_and_return_applies_a_pending_transform(page):
    start_transform(page)
    page.mouse.move(700, 450)
    steps = page.evaluate("window.formvis.engine.historySteps.names.length")
    box = field(page, "X")
    before = page.evaluate("window.formvis.engine.transformRefPoint().x")
    box.fill(str(before + 25))
    box.press("Enter")
    page.wait_for_function(f"Math.abs(window.formvis.engine.transformRefPoint().x - {before + 25}) < 0.6", timeout=5000)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Escape")
    page.wait_for_function("!window.formvis.engine.transformEdit", timeout=5000)
    assert page.evaluate("window.formvis.engine.historySteps.names.length") == steps

    start_transform(page)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Enter")
    page.wait_for_function("!window.formvis.engine.transformEdit", timeout=5000)


def test_arrow_keys_step_a_numeric_options_bar_field(page):
    start_transform(page)
    page.mouse.move(700, 450)
    box = field(page, "W")
    start = float(box.input_value())
    box.focus()
    box.press("ArrowUp")
    box.press("ArrowUp")
    page.wait_for_timeout(300)
    after_up = float(box.input_value())
    assert after_up > start
    box.press("ArrowDown")
    page.wait_for_timeout(300)
    assert start < float(box.input_value()) < after_up
