import json

import pytest

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
E = "window.formvis.engine"
SETUP = """() => { const e = window.formvis.engine; e.newDocument(400, 300, 'S', 'white'); e.setTool('marquee');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
LAYERS = "Object.fromEntries(window.formvis.engine.current.doc.layers.map((l) => [l.name, [l.transform.x, l.transform.y]]))"
COUNT = """(() => { const c = document.querySelector('.cv-overlay-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"""


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def cmd(page, name):
    page.evaluate(f"window.formvis.commands.run('{name}')")
    page.wait_for_timeout(250)


def box(page, at, name, x0, y0, x1, y1):
    page.evaluate(f"{E}.addLayer({{name: '{name}'}})")
    page.mouse.move(*at(x0, y0))
    page.mouse.down()
    page.mouse.move(*at(x1, y1), steps=5)
    page.mouse.up()
    page.evaluate(f"{E}.fill('fg')")
    page.keyboard.press("Control+d")


def start_drag(page, at, frm, to):
    page.evaluate(f"{E}.setTool('move')")
    page.mouse.move(*at(*frm))
    page.mouse.down()
    page.mouse.move(*at(*to), steps=10)
    page.wait_for_timeout(200)


def drag(page, at, frm, to):
    start_drag(page, at, frm, to)
    page.mouse.up()
    page.wait_for_timeout(250)


def wipe(page):
    page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.snap') || k === 'formvis.prefs') localStorage.removeItem(k)")


@pytest.fixture()
def scene(page):
    wipe(page)
    reload(page)
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    box(page, at, "A", 100, 100, 150, 140)
    box(page, at, "B", 250, 100, 300, 140)
    base = page.evaluate(LAYERS)
    yield at, base
    wipe(page)
    reload(page)


def test_a_dragged_layer_snaps_to_the_grid_and_not_when_snap_to_grid_is_off(page, scene):
    at, base = scene
    for name in ("snap-layers", "snap-bounds", "snap-guides"):
        cmd(page, name)
    cmd(page, "toggle-grid")
    assert page.evaluate(f"{E}.view.grid") is True
    step = page.evaluate(f"{E}.gridPixels() / {E}.view.gridSubdivisions")
    drag(page, at, (275, 120), (227, 120))
    snapped = page.evaluate(LAYERS)
    assert (base["B"][0] + (snapped["B"][0] - base["B"][0])) % step == pytest.approx(0, abs=0.01) or step - ((snapped["B"][0]) % step) < 0.01, (base, snapped, step)
    assert snapped["B"][0] - base["B"][0] == pytest.approx(-50, abs=0.01)
    page.evaluate(f"{E}.undo()")
    cmd(page, "snap-grid")
    drag(page, at, (275, 120), (227, 120))
    free = page.evaluate(LAYERS)
    assert free["B"][0] - base["B"][0] == pytest.approx(-48, abs=1.5)
    assert free["B"][0] != snapped["B"][0]


def test_smart_guides_are_drawn_while_a_dragged_layer_is_snapped_and_not_when_smart_guides_are_off(page, scene):
    at, base = scene
    cmd(page, "snap-bounds")
    off_idle = page.evaluate(COUNT)
    start_drag(page, at, (275, 120), (127, 120))
    on_guides = page.evaluate(f"{E}.snapGuides")
    on_count = page.evaluate(COUNT)
    page.mouse.up()
    page.wait_for_timeout(250)
    snapped = page.evaluate(LAYERS)["B"][0] - base["B"][0]
    assert on_guides, on_guides
    assert on_count > off_idle
    assert snapped == pytest.approx(-150, abs=0.01)
    assert page.evaluate(f"{E}.snapGuides") is None
    page.evaluate(f"{E}.undo()")
    cmd(page, "show-smart-guides")
    start_drag(page, at, (275, 120), (127, 120))
    off_count = page.evaluate(COUNT)
    page.mouse.up()
    page.wait_for_timeout(250)
    assert off_count < on_count
