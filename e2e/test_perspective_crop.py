QUAD = [[40, 30], [170, 50], [160, 170], [30, 150]]
SCENE = """(quad) => {
  const e = window.sonny.engine;
  e.newDocument(200, 200, 'K', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(220,30,40)'; c.beginPath(); quad.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
  c.fillStyle = 'rgb(20,40,220)'; c.fillRect(46, 38, 10, 10);
  l.raster.touch(); e.refresh();
}"""
PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
red = lambda p: p[0] > 180 and p[1] < 90 and p[2] < 90
blue = lambda p: p[2] > 160 and p[0] < 90


def test_a_skewed_card_comes_out_flat(page):
    page.evaluate(SCENE, QUAD)
    ok = page.evaluate("(q) => window.sonny.engine.perspectiveCrop(q.map(([x, y]) => ({ x, y })))", QUAD)
    assert ok is True
    w, h = page.evaluate("[window.sonny.engine.current.doc.width, window.sonny.engine.current.doc.height]")
    assert abs(w - 131) <= 2 and abs(h - 121) <= 2, (w, h)
    for x, y in [(w // 2, h // 2), (4, h - 5), (w - 5, 4), (w - 5, h - 5)]:
        assert red(page.evaluate(PX, [x, y])), (x, y)
    assert blue(page.evaluate(PX, [10, 10]))
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Perspective Crop"
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate("window.sonny.engine.current.doc.width") == 200


def test_the_tool_drags_a_corner_and_crops(page):
    page.evaluate(SCENE, QUAD)
    page.evaluate("window.sonny.engine.setTool('crop')")
    assert page.evaluate("window.sonny.engine.tool") == "crop"
    page.locator("label, button", has_text="Perspective").first.click()
    s = page.evaluate("(() => { const v = window.sonny.engine.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect(); return [r.left + v.panX, r.top + v.panY, v.zoom]; })()")
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40, 30)); page.mouse.down(); page.mouse.move(*at(100, 90), steps=4); page.mouse.move(*at(170, 170), steps=4); page.mouse.up()
    assert page.evaluate("window.sonny.engine.current.doc.width") == 200
    for corner, (x, y) in [((170, 30), (170, 50)), ((40, 170), (30, 150)), ((170, 170), (160, 170))]:
        page.mouse.move(*at(*corner)); page.mouse.down(); page.mouse.move(*at(x, y), steps=4); page.mouse.up()
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Perspective Crop"
    w, h = page.evaluate("[window.sonny.engine.current.doc.width, window.sonny.engine.current.doc.height]")
    assert red(page.evaluate(PX, [w // 2, h // 2]))
