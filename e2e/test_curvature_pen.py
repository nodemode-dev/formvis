SETUP = """async () => { const e = window.formvis.engine; e.newDocument(300, 200, 'C', 'white'); e.setTool('curvaturePen'); if (e.tool !== 'curvaturePen') throw new Error('tool');
  // Where to click only once the new document's view is fitted (1.52.8: read at once, the first click could miss).
  for (let i = 0; i < 100 && !(e.current.viewport.fitted && e.current.viewport.width > 0); i++) await new Promise((r) => requestAnimationFrame(r));
  // ... and its place unchanged for several frames (under load the docks can still be settling and move the stage).
  const key = () => { const q = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect(); return [q.panX, q.panY, q.zoom, r.left, r.top].join(); };
  for (let i = 0, last = '', same = 0; i < 300 && same < 4; i++) { await new Promise((r) => requestAnimationFrame(r)); const k = key(); same = k === last ? same + 1 : 0; last = k; }
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
STATE = """(() => { const sp = window.formvis.engine.workPath.subpaths; return sp.map((s) => ({ closed: s.closed, pts: s.anchors.map((a) => [Math.round(a.x), Math.round(a.y)]),
  smooth: s.anchors.map((a) => a.outX !== a.x || a.outY !== a.y) })); })()"""


def test_curvature_pen_places_smooth_points_corners_and_closes(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.click(*at(40, 120))
    page.keyboard.down("Alt"); page.mouse.click(*at(100, 40)); page.keyboard.up("Alt")
    page.mouse.click(*at(160, 120))
    page.mouse.click(*at(220, 40))
    st = page.evaluate(STATE)
    assert st[0]["pts"] == [[40, 120], [100, 40], [160, 120], [220, 40]], st
    assert st[0]["smooth"] == [False, False, True, False] and not st[0]["closed"], st   # ends sharp, the Alt point a corner
    page.keyboard.press("Backspace")
    assert page.evaluate(STATE)[0]["pts"] == [[40, 120], [100, 40], [160, 120]]
    page.mouse.click(*at(40, 120))                                                            # the first point closes it
    st = page.evaluate(STATE)
    assert st[0]["closed"] and st[0]["smooth"] == [True, False, True], st                  # closed: the first point turns smooth
    # Enter ends a new open path; the next click starts another subpath
    page.mouse.click(*at(200, 150)); page.mouse.click(*at(260, 180)); page.keyboard.press("Enter")
    page.mouse.click(*at(20, 20))
    st = page.evaluate(STATE)
    assert [len(x["pts"]) for x in st] == [3, 2, 1] and not st[1]["closed"], st
