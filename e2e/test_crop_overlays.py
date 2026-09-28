SETUP = """() => { const e = window.formvis.engine; e.newDocument(300, 200, 'O', 'white'); e.setTool('crop');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
SEL = ".cv-opt-group:not([hidden]) .cv-opt"


def test_crop_overlay_choice_and_keys(page):
    s = page.evaluate(SETUP)
    over = page.locator(SEL, has_text="Overlay").locator("select")
    assert over.input_value() == "thirds"
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40, 30)); page.mouse.down(); page.mouse.move(*at(260, 170), steps=5); page.mouse.up()
    page.keyboard.press("o")                                              # a frame shows: O cycles the overlay
    # the options bar syncs its controls on the next frame, so wait for the value rather than read it at once
    page.wait_for_function("[...document.querySelectorAll('.cv-opt-group:not([hidden]) .cv-opt')].find((o) => o.textContent.trim().startsWith('Overlay')).querySelector('select').value === 'grid'", timeout=3000)
    assert page.evaluate("window.formvis.engine.tool") == "crop"
    over.select_option("spiral")
    page.keyboard.press("Shift+O")                                        # flips the spiral; stays on the spiral
    assert over.input_value() == "spiral"
    page.keyboard.press("Escape")                                         # no frame now: O picks the Dodge group
    page.keyboard.press("o")
    assert page.evaluate("window.formvis.engine.tool") in ("dodge", "burn", "sponge")
