import pytest

STYLES = ["arc", "arcLower", "arcUpper", "arch", "bulge", "shellLower", "shellUpper", "flag", "wave", "fish", "rise", "fisheye", "inflate", "squeeze", "twist"]

RENDER = """async ([warp]) => {
  const T = await import('/src/engine/text.ts'), r = T.renderText({ ...T.defaultText(), content: 'WARPED', size: 48, family: 'sans-serif', warp });
  const d = r.raster.ctx.getImageData(0, 0, r.raster.width, r.raster.height).data;
  let h = 0; for (let i = 3; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
  return { w: r.raster.width, h: r.raster.height, hash: h };
}"""


def render(page, warp):
    return page.evaluate(RENDER, [warp])


def w(style, bend=50, orientation="horizontal"):
    return {"style": style, "orientation": orientation, "bend": bend, "horizontal": 0, "vertical": 0}


@pytest.mark.parametrize("style", STYLES)
def test_each_style_reshapes_the_type(page, style):
    plain, warped = render(page, None), render(page, w(style))
    assert warped["hash"] != plain["hash"], (style, plain, warped)


def test_no_warp_and_a_zero_warp_leave_the_type_exactly_as_it_was(page):
    plain = render(page, None)
    assert render(page, w("arc", 0)) == plain                 # an inactive warp takes the plain path


def test_orientation_turns_the_warp(page):
    assert render(page, w("rise")) != render(page, w("rise", orientation="vertical"))


def test_a_saved_warp_reads_back_and_a_bad_one_is_none(page):
    r = page.evaluate("""async () => { const T = await import('/src/engine/text.ts'), E = await import('/src/engine/index.ts'), ras = new E.Raster(4, 4);
      return { good: T.textFromData({ content: 'Hi', warp: { style: 'flag', orientation: 'vertical', bend: 250, horizontal: -30, vertical: 12 } }, ras).warp,
        bad: T.textFromData({ content: 'Hi', warp: { style: 'spiral', bend: 50 } }, ras).warp, old: T.textFromData({ content: 'Hi' }, ras).warp }; }""")
    assert r["good"] == {"style": "flag", "orientation": "vertical", "bend": 100, "horizontal": -30, "vertical": 12}, r   # bend clamped
    assert r["bad"] is None and r["old"] is None, r


def test_warp_text_from_the_menu_is_one_step_and_survives_editing(page):
    page.evaluate("""async () => { const T = await import('/src/engine/text.ts'), e = window.sonny.engine;
      e.newDocument(400, 200, 'W', 'white');
      await e.createTextLayer({ x: 40, y: 110 }, { ...T.defaultText(), content: 'Warp me', size: 48, family: 'sans-serif' }); }""")
    before = page.evaluate("window.sonny.engine.current.activeLayer.raster.width")
    assert page.evaluate("window.sonny.commands.run('warp-text')")
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    dlg.locator(".cv-field", has_text="Style").locator("select").select_option("arch")
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.sonny.engine.current.activeLayer.text.warp?.style === 'arch'")
    assert page.evaluate("window.sonny.engine.current.activeLayer.raster.height") > 0
    # Editing the text keeps the warp.
    page.evaluate("""async () => { const e = window.sonny.engine, l = e.current.activeLayer; await e.updateTextLayer(l.id, { ...l.text, content: 'Still warped' }); }""")
    assert page.evaluate("window.sonny.engine.current.activeLayer.text.warp.style") == "arch"
    page.evaluate("window.sonny.engine.undo()")                                  # the edit
    page.evaluate("window.sonny.engine.undo()")                                  # the warp, in one step
    assert page.evaluate("window.sonny.engine.current.activeLayer.text.warp ?? null") is None
    assert page.evaluate("window.sonny.engine.current.activeLayer.raster.width") == before
