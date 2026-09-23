SCENE = """() => {
  const e = window.sonny.engine;
  e.newDocument(200, 120, 'C', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 120);
  c.strokeStyle = '#000'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 60 - 80 * Math.tan(Math.PI / 18)); c.lineTo(180, 60 + 80 * Math.tan(Math.PI / 18)); c.stroke();
  l.raster.touch(); e.refresh();
}"""
DARK_Y = "(x) => { const c = window.sonny.engine.flattened().getContext('2d').getImageData(x, 0, 1, window.sonny.engine.current.doc.height).data, ys = []; for (let y = 0; y < c.length / 4; y++) if (c[y * 4] < 60 && c[y * 4 + 3] > 200) ys.push(y); return ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : null; }"
PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def test_straighten_levels_a_tilted_line(page):
    page.evaluate(SCENE)
    before, before2 = page.evaluate(DARK_Y, 60), page.evaluate(DARK_Y, 140)
    assert before2 - before > 10
    page.evaluate("window.sonny.engine.straightenCrop({ x: 0, y: 0, w: 200, h: 120 }, -10, false)")
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Straighten and Crop"
    assert abs(page.evaluate(DARK_Y, 60) - page.evaluate(DARK_Y, 140)) <= 1.5
    # the turn opens the corners, left empty without Content-Aware
    assert page.evaluate(PX, [1, 1])[3] == 0


def test_content_aware_fills_the_opened_corners_and_an_expanded_edge(page):
    page.evaluate(SCENE)
    page.evaluate("window.sonny.engine.straightenCrop({ x: 0, y: 0, w: 200, h: 120 }, -10, true)")
    corner = page.evaluate(PX, [1, 1])
    assert corner[3] == 255 and abs(corner[0] - 128) < 30
    page.evaluate(SCENE)
    page.evaluate("window.sonny.engine.straightenCrop({ x: -30, y: 0, w: 260, h: 120 }, 0, true)")
    assert page.evaluate("window.sonny.engine.current.doc.width") == 260
    edge = page.evaluate(PX, [5, 20])
    assert edge[3] == 255 and abs(edge[0] - 128) < 30
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate("window.sonny.engine.current.doc.width") == 200
