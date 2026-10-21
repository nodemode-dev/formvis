SETUP = """() => { const e = window.formvis.engine; e.newDocument(300, 200, 'O', 'white'); e.setTool('crop');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
# The Overlay control sits in the options bar, or in its More menu when the bar is narrow: found in either place.
OVERLAY = "[...document.querySelectorAll('.cv-opt-group:not([hidden]) .cv-opt, .cv-opt-pop-sect .cv-opt')].find((o) => o.textContent.trim().startsWith('Overlay')).querySelector('select')"


def overlay(page):
    return page.evaluate(f"{OVERLAY}.value")


def choose_overlay(page, value):
    page.evaluate(f"(v) => {{ const s = {OVERLAY}; s.value = v; s.dispatchEvent(new Event('change', {{ bubbles: true }})); }}", value)


def test_crop_overlay_choice_and_keys(page):
    s = page.evaluate(SETUP)
    assert overlay(page) == "thirds"
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40, 30)); page.mouse.down(); page.mouse.move(*at(260, 170), steps=5); page.mouse.up()
    page.keyboard.press("o")                                              # a frame shows: O cycles the overlay
    # the options bar syncs its controls on the next frame, so wait for the value rather than read it at once
    page.wait_for_function(f"{OVERLAY}.value === 'grid'", timeout=3000)
    assert page.evaluate("window.formvis.engine.tool") == "crop"
    choose_overlay(page, "spiral")
    page.keyboard.press("Shift+O")                                        # flips the spiral; stays on the spiral
    assert overlay(page) == "spiral"
    page.keyboard.press("Escape")                                         # no frame now: O picks the Dodge group
    page.keyboard.press("o")
    assert page.evaluate("window.formvis.engine.tool") in ("dodge", "burn", "sponge")
