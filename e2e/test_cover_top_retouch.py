import re

PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
OVERLAY = "(() => { const c = document.querySelector('.cv-overlay-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_frequency_separation_makes_low_and_high_layers_that_look_unchanged_and_undo_in_one_step(page):
    # SC-ED-0102
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(120, 80, 'FS', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = '#c83232'; k.fillRect(0, 0, 60, 80); k.fillStyle = '#3232c8'; k.fillRect(60, 0, 60, 80); e.activeLayer.raster.touch(); e.refresh(); }""")
    menu(page, "Image", "Frequency Separation...")
    page.wait_for_timeout(500)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 3")
    assert page.evaluate("window.formvis.engine.current.doc.layers.map(l => [l.name, l.blend])") == [["Background", "normal"], ["Low Frequency", "normal"], ["High Frequency", "linear-light"]]
    for xy, want in (([10, 10], (200, 50, 50)), ([100, 10], (50, 50, 200))):
        got = page.evaluate(PX, xy)
        assert all(abs(a - b) <= 3 for a, b in zip(got[:3], want)), got
    low = page.evaluate("""() => { const l = window.formvis.engine.current.doc.layers.find(l => l.name === 'Low Frequency'); const d = l.raster.read(0, 0, l.raster.width, l.raster.height).data; const i = (40 * l.raster.width + 59) * 4; return [d[i], d[i + 1], d[i + 2]]; }""")
    assert 60 < low[0] < 190 and 60 < low[2] < 190, low
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 1")


def test_quick_selection_lays_a_white_footprint_band_while_dragging_that_is_gone_on_release(page):
    # PC-UI-0812
    page.evaluate("const e = window.formvis.engine; e.newDocument(120, 80, 'QS', 'white'); e.deselect(); e.setTool('quickSelect'); e.setBrush({ diameter: 20 })")
    page.mouse.move(*scr(page, 20, 30))
    idle = page.evaluate(OVERLAY)
    page.mouse.down()
    page.mouse.move(*scr(page, 80, 30), steps=10)
    page.wait_for_timeout(200)
    assert page.evaluate(OVERLAY) > idle * 10
    during = page.evaluate(OVERLAY)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate(OVERLAY) < during / 4
