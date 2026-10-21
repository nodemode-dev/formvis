HEX = "() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); return d.querySelector('input[type=text]').value; }"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def test_the_first_click_on_the_picture_after_opening_the_colour_picker_samples_it(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(160, 100, 'P', 'white'); const k = e.activeLayer.raster.ctx; k.fillStyle = '#c83232'; k.fillRect(0,0,80,100); k.fillStyle = '#2832c8'; k.fillRect(80,0,80,100); e.activeLayer.raster.touch(); e.refresh(); }""")
    page.wait_for_timeout(500)
    page.click(".cv-swatch-fg")
    page.wait_for_timeout(600)
    page.mouse.click(*scr(page, 30, 50))
    page.wait_for_timeout(800)
    assert page.evaluate(HEX).lower() == "#c83232"
    page.keyboard.press("Escape")
