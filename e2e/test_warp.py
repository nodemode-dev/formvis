SCENE = """() => {
  const e = window.sonny.engine;
  e.newDocument(210, 150, 'W', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#000'; c.fillRect(95, 0, 20, 150); l.raster.touch(); e.refresh();
  window.sonny.commands.run('transform-warp');
  const w = e.meshWarpEdit, v = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect();
  const [x, y] = w.points[5];
  return { n: w.points.length, tool: e.tool, at: [r.left + v.panX + x * v.zoom, r.top + v.panY + y * v.zoom], zoom: v.zoom, pt: [x, y] };
}"""
PX = "([x, y]) => window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0]"
CENTRE = "(y) => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(0, y, 210, 1).data, xs = []; for (let x = 0; x < 210; x++) if (d[x * 4] < 128) xs.push(x); return xs.length ? Math.round((xs[0] + xs[xs.length - 1] + 1) / 2) : null; }"


def test_warp_bends_the_layer_where_the_point_moved(page):
    s = page.evaluate(SCENE)
    assert s["n"] == 16 and s["tool"] == "move"
    (sx, sy), z = s["at"], s["zoom"]
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 15 * z, sy, steps=3)
    page.mouse.move(sx + 30 * z, sy, steps=3)
    page.mouse.up()
    moved = page.evaluate("window.sonny.engine.meshWarpEdit.points[5]")
    assert abs(moved[0] - (s["pt"][0] + 30)) < 1 and abs(moved[1] - s["pt"][1]) < 1
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    assert page.evaluate("window.sonny.engine.meshWarpEdit") is None
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Warp"
    y = round(s["pt"][1])
    # the bar (95 to 115, centre 105) lies between control columns, so it moves part of the 30 px; the top edge is pinned
    assert abs(page.evaluate(CENTRE, 1) - 105) <= 1
    assert 110 <= page.evaluate(CENTRE, y) <= 135
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate(PX, [100, y]) < 60


def test_escape_cancels_and_folding_moves_are_ignored(page):
    s = page.evaluate(SCENE)
    r = page.evaluate("""() => {
      const e = window.sonny.engine, before = JSON.stringify(e.meshWarpEdit.points);
      e.moveMeshWarpPoint(5, { x: e.meshWarpEdit.points[6][0] + 40, y: e.meshWarpEdit.points[6][1] });
      const unchanged = JSON.stringify(e.meshWarpEdit.points) === before;
      return unchanged;
    }""")
    assert r is True
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    assert page.evaluate("window.sonny.engine.meshWarpEdit") is None
    assert page.evaluate("window.sonny.engine.historySteps.names.includes('Warp')") is False
