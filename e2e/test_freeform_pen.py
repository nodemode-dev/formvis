import math

SETUP = """() => { const e = window.sonny.engine; e.newDocument(300, 240, 'F', 'white'); e.setTool('freeformPen'); if (e.tool !== 'freeformPen') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""


def test_freeform_pen_draws_a_smooth_closed_loop_and_an_open_stroke(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    cx, cy, r = 150, 120, 70
    pts = [(cx + r * math.cos(t / 60 * 2 * math.pi), cy + r * math.sin(t / 60 * 2 * math.pi)) for t in range(61)]
    page.mouse.move(*at(*pts[0])); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*at(*p))
    page.mouse.up()
    loop = page.evaluate("window.sonny.engine.workPath.subpaths.map((s) => ({ closed: s.closed, n: s.anchors.length, r: s.anchors.map((a) => Math.hypot(a.x - 150, a.y - 120)), smooth: s.anchors.filter((a) => a.outX !== a.x || a.outY !== a.y).length }))")
    assert len(loop) == 1 and loop[0]["closed"], loop
    # Curve Fit is 2 screen pixels, so the count depends on the zoom; what matters is that the 61 samples are thinned
    # well below their number, every kept point is smooth, and all lie on the drawn circle.
    assert 6 <= loop[0]["n"] <= 61 * 0.6 and loop[0]["smooth"] == loop[0]["n"], loop
    assert all(abs(d - r) < 3 for d in loop[0]["r"]), loop[0]["r"]
    # a nearly straight stroke becomes an open subpath of two points
    page.mouse.move(*at(30, 220)); page.mouse.down()
    for i in range(1, 41): page.mouse.move(*at(30 + i * 6, 220 + (0.3 if i % 2 else -0.3)))
    page.mouse.up()
    line = page.evaluate("(() => { const s = window.sonny.engine.workPath.subpaths[1]; return [s.closed, s.anchors.length]; })()")
    assert line == [False, 2], line
