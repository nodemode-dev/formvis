# Smart object Warp, Perspective Warp and Puppet Warp, Reset Warp, and D30 (Split Warp splits where the pointer is).
SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 200, 'W', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(60, 60, 80, 80, new Uint8Array(6400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.convertToSmartObject(); return !!e.current.activeLayer.smart; }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
RED, WHITE = [255, 0, 0], [255, 255, 255]


def test_warp_on_a_smart_object_starts_a_four_by_four_grid(page):
    assert page.evaluate(SETUP) is True
    page.evaluate("window.formvis.commands.run('transform-warp')")
    page.wait_for_function("!!window.formvis.engine.meshWarpEdit", timeout=5000)
    assert page.evaluate("window.formvis.engine.meshWarpEdit.points.length") == 16


def test_escape_cancels_a_smart_object_warp_and_changes_nothing(page):
    page.evaluate(SETUP)
    page.evaluate("window.formvis.commands.run('transform-warp')")
    page.wait_for_function("!!window.formvis.engine.meshWarpEdit", timeout=5000)
    page.evaluate("window.formvis.engine.meshWarpEdit.points[0] = [0, 0]")
    page.evaluate("window.formvis.engine.cancelMeshWarp ? window.formvis.engine.cancelMeshWarp() : null")
    assert page.evaluate("!window.formvis.engine.meshWarpEdit && !window.formvis.engine.current.activeLayer.smart.deform") is True
    assert page.evaluate(PX, [65, 65]) == RED


def test_perspective_warp_starts_on_a_smart_object_and_escape_leaves_it_alone(page):
    page.evaluate(SETUP)
    page.evaluate("window.formvis.commands.run('perspective-warp')")
    page.wait_for_function("!!window.formvis.engine.perspectiveEdit", timeout=5000)
    page.evaluate("window.formvis.engine.cancelPerspectiveWarp()")
    assert page.evaluate("!window.formvis.engine.perspectiveEdit && !!window.formvis.engine.current.activeLayer.smart") is True
    assert page.evaluate(PX, [65, 65]) == RED


def test_puppet_warp_starts_on_a_smart_object_with_a_mesh_and_cancel_leaves_it(page):
    page.evaluate(SETUP)
    page.evaluate("window.formvis.commands.run('puppet-warp')")
    page.wait_for_function("!!window.formvis.engine.puppetEdit", timeout=5000)
    assert page.evaluate("window.formvis.engine.puppetMesh() !== null") is True
    page.evaluate("window.formvis.engine.cancelPuppetWarp()")
    assert page.evaluate("!window.formvis.engine.puppetEdit && !!window.formvis.engine.current.activeLayer.smart") is True


def test_d30_split_warp_splits_at_the_pointer_not_the_largest_cell_middle(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(300, 300, 'S', 'white'); e.addLayer(); e.fg = { r: 0, g: 0, b: 0 }; e.fill('fg'); }""")
    page.evaluate("window.formvis.commands.run('transform-warp')")
    page.wait_for_function("!!window.formvis.engine.meshWarpEdit", timeout=5000)
    before = page.evaluate("window.formvis.engine.meshWarpEdit.gw")
    page.evaluate("window.formvis.commands.run('warp-split-v', { x: 40, y: 150 })")
    w = page.evaluate("({ gw: window.formvis.engine.meshWarpEdit.gw, us: window.formvis.engine.meshWarpEdit.us })")
    assert w["gw"] == before + 1
    assert not any(abs(u - 1.5) < 0.01 for u in w["us"]), w["us"]
    assert any(0 < u < 1 for u in w["us"]), w["us"]
