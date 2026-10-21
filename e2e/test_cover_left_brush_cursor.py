SCENE = """() => { const e = window.formvis.engine; e.newDocument(300, 200, 'B', 'white'); e.deselect(); e.setTool('brush'); e.setBrush({ diameter: 40, hardness: 1, opacity: 1 });
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
RING = """([cx, cy, zoom]) => { const o = document.querySelector('.cv-overlay-canvas'), r = o.getBoundingClientRect(), k = o.width / r.width;
  const g = o.getContext('2d'); const ink = (dx, dy) => g.getImageData(Math.round((cx - r.left + dx) * k), Math.round((cy - r.top + dy) * k), 1, 1).data[3] > 0;
  const radii = []; for (let d = 0; d < 250; d++) { if (ink(d, 0) || ink(-d, 0) || ink(0, d) || ink(0, -d)) radii.push(d); } return { radii, cursor: o.style.cursor }; }"""


def hover(page, s, x, y):
    page.mouse.move(s[0] + (x - 5) * s[2], s[1] + y * s[2])
    page.mouse.move(s[0] + x * s[2], s[1] + y * s[2], steps=3)
    page.wait_for_timeout(300)
    return [s[0] + x * s[2], s[1] + y * s[2], s[2]]


def test_brush_cursor_is_a_ring_of_the_brush_size_that_follows_the_pointer(page):
    # CO-0090, SC-ED-0089
    s = page.evaluate(SCENE)
    at = hover(page, s, 150, 100)
    got = page.evaluate(RING, at)
    assert got["cursor"] == "none", got
    r = 20 * s[2]
    near = [d for d in got["radii"] if r - 4 <= d <= r + 4]
    assert near and not [d for d in got["radii"] if d < r - 8], got
    at = hover(page, s, 220, 60)
    moved = page.evaluate(RING, at)
    assert [d for d in moved["radii"] if r - 4 <= d <= r + 4]
    page.evaluate("window.formvis.engine.setBrush({ diameter: 100 })")
    at = hover(page, s, 150, 100)
    big = page.evaluate(RING, at)
    assert [d for d in big["radii"] if 50 * s[2] - 4 <= d <= 50 * s[2] + 4] and not [d for d in big["radii"] if d < 50 * s[2] - 8], big
