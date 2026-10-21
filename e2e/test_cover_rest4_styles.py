SET = """([label, v]) => { const d = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].pop();
  const i = [...d.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
GET = """(label) => { const d = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].pop();
  const i = [...d.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length); return i && i.value; }"""


def press(page, text):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text=text).last.click()
    page.wait_for_timeout(500)


def open_style(page, name):
    page.evaluate(f"() => {{ window.formvis.engine.newDocument(120, 80, '{name}', 'white'); }}")
    assert page.evaluate("window.formvis.commands.run('layer-style')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot").last.wait_for()
    page.wait_for_timeout(1200)


def test_make_default_keeps_the_drop_shadow_distance_and_reset_to_default_and_a_new_dialog_return_to_it(page):
    open_style(page, "A")
    assert page.evaluate(GET, "Distance (px)") == "5"
    page.evaluate(SET, ["Distance (px)", 21])
    page.wait_for_timeout(300)
    press(page, "Make Default")
    assert "21" in page.evaluate("localStorage.getItem('formvis.layerStyleDefault')")
    page.evaluate(SET, ["Distance (px)", 5])
    page.wait_for_timeout(300)
    assert page.evaluate(GET, "Distance (px)") == "5"
    press(page, "Reset to Default")
    assert page.evaluate(GET, "Distance (px)") == "21"
    press(page, "Cancel")
    open_style(page, "B")
    assert page.evaluate(GET, "Distance (px)") == "21"
    press(page, "Cancel")


def test_a_locked_brush_section_keeps_its_values_when_reset_is_pressed_and_an_unlocked_one_does_not(page):
    page.evaluate("() => { window.formvis.engine.newDocument(100, 100, 'F', 'white'); }")
    assert page.evaluate("window.formvis.commands.run('brush-settings')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot").last.wait_for()
    page.wait_for_timeout(1200)
    page.evaluate(SET, ["Size Jitter (%)", 40])
    page.evaluate(SET, ["Scatter (%)", 50])
    page.wait_for_timeout(300)
    assert page.evaluate("(({ sizeJitter, scatter }) => [sizeJitter, scatter])(window.formvis.engine.brushShape)") == [40, 50]
    page.locator('.cv-scrim:not([hidden]) .cv-dialog label:has-text("Lock Shape Dynamics") input').first.check()
    page.wait_for_timeout(300)
    assert page.evaluate("window.formvis.engine.brushShape.locks") == ["shapeDynamics"]
    press(page, "Reset")
    assert page.evaluate("(({ sizeJitter, scatter }) => [sizeJitter, scatter])(window.formvis.engine.brushShape)") == [40, 0]
    page.locator('.cv-scrim:not([hidden]) .cv-dialog label:has-text("Lock Shape Dynamics") input').first.uncheck()
    page.wait_for_timeout(300)
    press(page, "Reset")
    assert page.evaluate("window.formvis.engine.brushShape.sizeJitter") == 0


def test_dragging_a_slider_label_scrubs_its_value_and_shift_makes_it_ten_times_faster(page):
    page.evaluate("() => { window.formvis.engine.newDocument(100, 100, 'F', 'white'); }")
    assert page.evaluate("window.formvis.commands.run('brush-settings')")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot").last.wait_for()
    page.wait_for_timeout(1200)
    box = page.locator(".cv-scrim:not([hidden]) .cv-dialog .cv-scrub", has_text="Size Jitter (%)").first.bounding_box()
    y = box["y"] + box["height"] / 2

    def drag(dx, shift=False):
        if shift:
            page.keyboard.down("Shift")
        page.mouse.move(box["x"] + 5, y)
        page.mouse.down()
        page.mouse.move(box["x"] + 5 + dx, y, steps=8)
        page.mouse.up()
        if shift:
            page.keyboard.up("Shift")
        page.wait_for_timeout(300)
        return page.evaluate("window.formvis.engine.brushShape.sizeJitter")

    assert drag(125) == 50
    assert drag(-50) == 30
    assert drag(10, True) == 70
