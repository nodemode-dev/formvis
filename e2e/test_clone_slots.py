SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'C', 'white');
  const l = e.current.activeLayer, c = l.raster.canvas.getContext('2d'); c.fillStyle = '#ff0000'; c.fillRect(0, 0, 100, 100);
  e.emit('render', null); e.setTool('cloneStamp'); e.brush.diameter = 20;
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
BAR = ".cv-opt-group:not([hidden])"
SLOT = "(() => { const e = window.formvis.engine; return [e.cloneSlot, e.cloneSource && [Math.round(e.cloneSource.x), Math.round(e.cloneSource.y)], e.retouch.cloneScale]; })()"
PIXEL = """([x, y]) => { const cv = document.querySelector('.cv-overlay-canvas'), r = cv.getBoundingClientRect(), k = cv.width / r.width;
  return Array.from(cv.getContext('2d').getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data); }"""


def test_five_clone_sources_and_the_overlay(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    def alt_click(x, y):
        page.mouse.move(*at(x, y)); page.keyboard.down("Alt"); page.mouse.down(); page.mouse.up(); page.keyboard.up("Alt")
    alt_click(20, 50)
    assert page.evaluate(SLOT) == [0, [20, 50], 100]
    page.locator(BAR).get_by_role("button", name="2", exact=True).click()
    assert page.evaluate(SLOT) == [1, None, 100]                              # an empty slot has no source yet
    alt_click(150, 50)
    page.evaluate("(() => { const e = window.formvis.engine; e.retouch.cloneScale = 50; e.emit('options', null); })()")
    page.locator(BAR).get_by_role("button", name="1", exact=True).click()
    assert page.evaluate(SLOT) == [0, [20, 50], 100]                          # slot 1: its point, its scale
    page.locator(BAR).get_by_role("button", name="2", exact=True).click()
    assert page.evaluate(SLOT) == [1, [150, 50], 50]                          # slot 2: its point, its scale
    page.locator(BAR).get_by_role("button", name="1", exact=True).click()
    # Hover 100 px right of the source: far from the brush, the clipped overlay draws nothing; unclipped shows the source.
    page.mouse.move(*at(120, 50)); page.wait_for_timeout(150)
    far = at(180, 20)
    assert page.evaluate(PIXEL, list(far))[3] == 0
    page.locator(f"{BAR} .cv-opt", has_text="Clipped").locator("input").uncheck()
    page.mouse.move(*at(121, 50)); page.mouse.move(*at(120, 50)); page.wait_for_timeout(150)
    px = page.evaluate(PIXEL, list(far))
    assert px[3] > 200 and px[0] > 200 and px[1] < 60, px                    # the source's red, where a stroke would copy it
    page.locator(f"{BAR} .cv-opt", has_text="Clipped").locator("input").check()
