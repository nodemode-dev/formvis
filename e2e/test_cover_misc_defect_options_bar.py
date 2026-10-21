# D28: the Relight options bar showed its hint sentence as the tool chip title instead of "Relight".
# D07: the Move tool's transform fields stay on the options bar after the pointer is released and take typed values.

import re

CHIP = ".cv-opt-tool"


def field(page, label):
    return page.locator("label.cv-opt", has=page.locator("span:first-child", has_text=re.compile(f"^{label}$"))).locator("input").first


def test_d28_relight_options_bar_chip_reads_relight(page):
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'R', 'white')")
    page.evaluate("window.formvis.engine.setTool('relight')")
    page.wait_for_function("window.formvis.engine.tool === 'relight'", timeout=5000)
    chip = page.locator(f"{CHIP}:visible")
    chip.first.wait_for(timeout=5000)
    assert chip.count() == 1
    assert chip.first.get_attribute("aria-label") == "Relight"
    assert chip.first.get_attribute("title") == "Relight"


def test_d07_move_tool_transform_fields_are_on_the_bar_without_a_pointer_held(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(200, 200, 'M', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
      e.applySelection(E.SelectionMask.cropped(50, 50, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.setTool('move'); }""")
    page.wait_for_function("window.formvis.engine.tool === 'move'", timeout=5000)
    page.evaluate("window.formvis.commands.run('transform')")
    page.wait_for_function("!!window.formvis.engine.transformEdit", timeout=5000)
    page.mouse.move(700, 450)
    for label in ("X", "Y", "W", "H", "Angle"):
        assert field(page, label).is_visible(), label
    before = page.evaluate("window.formvis.engine.transformRefPoint().x")
    box = field(page, "X")
    box.fill(str(before + 30))
    box.press("Enter")
    page.wait_for_function(f"Math.abs(window.formvis.engine.transformRefPoint().x - {before + 30}) < 0.6", timeout=5000)
    page.evaluate("window.formvis.engine.applyPendingTransform()")
    assert page.evaluate("!window.formvis.engine.transformEdit")
