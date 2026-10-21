SETUP = """async () => { const e = window.formvis.engine; e.newDocument(300, 200, 'P', 'white'); e.setTool('pen'); e.penSettings.mode = 'path';
  for (let i = 0; i < 100 && !(e.current.viewport.fitted && e.current.viewport.width > 0); i++) await new Promise((r) => requestAnimationFrame(r));
  const key = () => { const q = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect(); return [q.panX, q.panY, q.zoom, r.left, r.top].join(); };
  for (let i = 0, last = '', same = 0; i < 300 && same < 4; i++) { await new Promise((r) => requestAnimationFrame(r)); const k = key(); same = k === last ? same + 1 : 0; last = k; }
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
STATE = "window.formvis.engine.workPath.subpaths.map((s) => ({ closed: s.closed, pts: s.anchors.map((a) => [Math.round(a.x), Math.round(a.y), a.outX === a.x && a.outY === a.y]) }))"


def test_pen_clicks_make_a_corner_polyline_enter_ends_it_and_the_next_click_starts_a_new_path(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    for q in [(40, 150), (120, 40), (220, 150)]:
        page.mouse.click(*at(*q))
    first = [{"closed": False, "pts": [[40, 150, True], [120, 40, True], [220, 150, True]]}]
    assert page.evaluate(STATE) == first
    page.keyboard.press("Enter")
    assert page.evaluate(STATE) == first
    page.mouse.click(*at(60, 30))
    page.mouse.click(*at(260, 30))
    assert page.evaluate(STATE) == first + [{"closed": False, "pts": [[60, 30, True], [260, 30, True]]}]
    page.keyboard.press("Control+z")
    assert page.evaluate(STATE) == first + [{"closed": False, "pts": [[60, 30, True]]}]
