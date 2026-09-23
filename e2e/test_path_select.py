SETUP = """() => {
  const e = window.sonny.engine;
  e.newDocument(200, 160, 'P', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }), sq = (x, y) => ({ closed: true, anchors: [c(x, y), c(x + 40, y), c(x + 40, y + 40), c(x, y + 40)] });
  e.setWorkPath({ subpaths: [sq(20, 20), sq(100, 20)] });
  e.setTool('pathSelect'); if (e.tool !== 'pathSelect') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom];
}"""
FIRSTS = "window.sonny.engine.workPath.subpaths.map((s) => [Math.round(s.anchors[0].x), Math.round(s.anchors[0].y)])"


def test_path_selection_moves_copies_nudges_and_deletes_whole_subpaths(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    # drag inside the second square: only it moves
    page.mouse.move(*at(120, 40)); page.mouse.down(); page.mouse.move(*at(140, 50), steps=5); page.mouse.up()
    assert page.evaluate(FIRSTS) == [[20, 20], [120, 30]]
    # Alt-drag the first: a copy moves, the original stays
    page.keyboard.down("Alt")
    page.mouse.move(*at(40, 40)); page.mouse.down(); page.mouse.move(*at(40, 110), steps=5); page.mouse.up()
    page.keyboard.up("Alt")
    assert page.evaluate(FIRSTS) == [[20, 20], [20, 90], [120, 30]]
    # the arrow key nudges the chosen copy by one pixel, Shift by ten
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Shift+ArrowUp")
    assert page.evaluate(FIRSTS) == [[20, 20], [21, 80], [120, 30]]
    # Delete removes it
    page.keyboard.press("Delete")
    assert page.evaluate(FIRSTS) == [[20, 20], [120, 30]]
    # clicking empty canvas chooses nothing; Delete then changes nothing, and does not fall through to deleting the layer
    page.mouse.click(*at(80, 140))
    page.keyboard.press("Delete")
    assert page.evaluate(FIRSTS) == [[20, 20], [120, 30]]
    assert page.evaluate("window.sonny.engine.current.doc.layers.length") == 1
