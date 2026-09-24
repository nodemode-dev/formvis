SETUP = """() => { const e = window.sonny.engine; e.newDocument(300, 160, 'F', 'white'); e.fg = { r: 0, g: 0, b: 0 };
  e.setTool('brush'); e.setBrushMode('paint'); e.setBrush({ diameter: 20, hardness: 1, opacity: 1 }); e.brushFlow = 1;
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
PX = "([x, y]) => window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0]"


def set_opt(page, label, v):
    i = page.locator(".cv-opt-group:not([hidden]) .cv-opt", has_text=label).locator("input[type=number]").first   # Flow precedes "Min flow"
    i.fill(str(v)); i.press("Tab")


def scrub(page, s, y, passes):
    """One stroke that runs back and forth `passes` times along a line, without lifting."""
    at = lambda x: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40)); page.mouse.down()
    for k in range(passes): page.mouse.move(*at(260 if k % 2 == 0 else 40), steps=30)
    page.mouse.up()


def test_flow_builds_within_a_stroke_and_opacity_caps_it(page):
    s = page.evaluate(SETUP)
    # Opacity 20, Flow 100: scrubbing within one stroke never builds past 20 percent (about 204 on white)
    set_opt(page, "Opacity", 20); scrub(page, s, 30, 3)
    once = page.evaluate(PX, [150, 30])
    assert 195 <= once <= 210, once
    # Opacity 100, Flow 2: paint builds as the stroke passes again. (A 20 px brush overlaps about 21 dabs at each point,
    # so at 20% one pass is already near black: 1 - 0.8^21. At 2%, one pass leaves about 0.98^21 = 65% of white, three
    # passes about 27%.)
    set_opt(page, "Opacity", 100); set_opt(page, "Flow", 2)
    scrub(page, s, 80, 1); one = page.evaluate(PX, [150, 80])
    scrub(page, s, 120, 3); three = page.evaluate(PX, [150, 120])
    assert three < one - 20, (one, three)
    # Opacity 50, Flow 20: however long it builds, the stroke stops at its 50 percent cap (about 127). (At Flow 2% the
    # paint stalls near 85% of full, 147 here, however many passes: the paint layer is 8 bit, so a 2% dab's step rounds
    # to nothing once the gap is small. A known limitation, recorded in BUILD_NOTES.)
    set_opt(page, "Flow", 20)
    page.evaluate("window.sonny.engine.newDocument(300, 160, 'F2', 'white')")
    s = page.evaluate("(() => { const e = window.sonny.engine, v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; })()")
    set_opt(page, "Opacity", 50); scrub(page, s, 80, 9)
    capped = page.evaluate(PX, [150, 80])
    assert 122 <= capped <= 135, capped
