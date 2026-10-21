import pytest

SETUP = """() => { const e = window.formvis.engine; e.newDocument(400, 300, 'S', 'white'); e.setTool('marquee');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
LAYERS = "Object.fromEntries(window.formvis.engine.current.doc.layers.map((l) => [l.name, [l.transform.x, l.transform.y]]))"


def box(page, at, name, x0, y0, x1, y1):
    page.evaluate(f"window.formvis.engine.addLayer({{name: '{name}'}})")
    page.mouse.move(*at(x0, y0))
    page.mouse.down()
    page.mouse.move(*at(x1, y1), steps=5)
    page.mouse.up()
    page.evaluate("window.formvis.engine.fill('fg')")
    page.keyboard.press("Control+d")


def drag(page, at, frm, to):
    page.evaluate("window.formvis.engine.setTool('move')")
    page.mouse.move(*at(*frm))
    page.mouse.down()
    page.mouse.move(*at(*to), steps=10)
    page.mouse.up()


@pytest.fixture()
def scene(page):
    page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.snap')) localStorage.removeItem(k)")
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    box(page, at, "A", 100, 100, 150, 140)
    box(page, at, "B", 250, 100, 300, 140)
    base = page.evaluate(LAYERS)
    yield at, base
    page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.snap')) localStorage.removeItem(k)")


def test_a_dragged_layer_snaps_to_the_edge_of_another_layer_and_not_when_snap_to_layers_is_off(page, scene):
    at, base = scene
    page.evaluate("window.formvis.commands.run('snap-bounds')")
    drag(page, at, (275, 120), (178, 120))
    snapped = page.evaluate(LAYERS)
    assert snapped["B"][0] - base["B"][0] == pytest.approx(-100, abs=0.01), (base, snapped)
    page.evaluate("window.formvis.engine.undo()")
    page.evaluate("window.formvis.commands.run('snap-layers')")
    drag(page, at, (275, 120), (178, 120))
    free = page.evaluate(LAYERS)
    assert free["B"][0] - base["B"][0] == pytest.approx(-97, abs=1.5), (base, free)
    assert free["B"][0] != snapped["B"][0]


def test_a_dragged_layer_snaps_to_the_document_edge_and_not_when_snap_to_bounds_is_off(page, scene):
    at, base = scene
    page.evaluate("window.formvis.commands.run('snap-layers')")
    drag(page, at, (275, 120), (372, 120))
    snapped = page.evaluate(LAYERS)
    assert snapped["B"][0] - base["B"][0] == pytest.approx(100, abs=0.01), (base, snapped)
    page.evaluate("window.formvis.engine.undo()")
    page.evaluate("window.formvis.commands.run('snap-bounds')")
    drag(page, at, (275, 120), (372, 120))
    free = page.evaluate(LAYERS)
    assert free["B"][0] - base["B"][0] == pytest.approx(97, abs=1.5), (base, free)


def test_a_dragged_layer_snaps_to_a_guide_and_stops_when_the_master_snap_switch_is_off(page, scene):
    at, base = scene
    page.evaluate("window.formvis.commands.run('snap-layers'); window.formvis.commands.run('snap-bounds'); window.formvis.engine.addGuide('x', 200)")
    drag(page, at, (275, 120), (222, 120))
    snapped = page.evaluate(LAYERS)
    assert snapped["B"][0] - base["B"][0] == pytest.approx(-50, abs=0.01), (base, snapped)
    page.evaluate("window.formvis.engine.undo()")
    page.evaluate("window.formvis.commands.run('snap')")
    drag(page, at, (275, 120), (222, 120))
    free = page.evaluate(LAYERS)
    assert free["B"][0] - base["B"][0] == pytest.approx(-53, abs=1.5), (base, free)
