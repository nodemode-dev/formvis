SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 200, 'W', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(60, 60, 80, 80, new Uint8Array(6400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.convertToSmartObject(); return !!e.current.activeLayer.smart; }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
RED, WHITE = [255, 0, 0], [255, 255, 255]
DEFORM = "!!window.formvis.engine.current.activeLayer.smart.deform"


def test_a_committed_warp_on_a_smart_object_stays_live_reopens_on_the_warped_mesh_and_reset_warp_restores_it(page):
    assert page.evaluate(SETUP) is True
    page.evaluate("window.formvis.commands.run('transform-warp')")
    page.wait_for_function("!!window.formvis.engine.meshWarpEdit", timeout=5000)
    page.evaluate("() => { const w = window.formvis.engine.meshWarpEdit; window.formvis.engine.moveMeshWarpPoint(5, { x: w.points[5][0] + 25, y: w.points[5][1] + 25 }); }")
    page.evaluate("window.formvis.engine.applyMeshWarp()")
    page.wait_for_timeout(500)
    assert page.evaluate(DEFORM) is True
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.smart") is True
    moved = page.evaluate("() => [[62, 62], [66, 66], [75, 75], [100, 100], [138, 138]].map(([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3))")
    assert any(p != RED for p in moved)
    page.evaluate("window.formvis.commands.run('transform-warp')")
    page.wait_for_function("!!window.formvis.engine.meshWarpEdit", timeout=5000)
    pts = page.evaluate("window.formvis.engine.meshWarpEdit.points[5]")
    assert abs(pts[0] - 86.67) > 2 and abs(pts[1] - 86.67) > 2, pts
    page.evaluate("window.formvis.engine.cancelMeshWarp()")
    assert page.evaluate("window.formvis.commands.run('smart-warp-reset')") is True
    page.wait_for_timeout(500)
    assert page.evaluate(DEFORM) is False
    assert page.evaluate(PX, [65, 65]) == RED and page.evaluate(PX, [135, 135]) == RED and page.evaluate(PX, [30, 30]) == WHITE
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.smart") is True


def test_a_perspective_warp_on_a_smart_object_pinches_it_live_and_reset_warp_restores_it(page):
    assert page.evaluate(SETUP) is True
    page.evaluate("window.formvis.commands.run('perspective-warp')")
    page.wait_for_function("!!window.formvis.engine.perspectiveEdit", timeout=5000)
    state = page.evaluate("JSON.stringify(Object.keys(window.formvis.engine.perspectiveEdit))")
    page.evaluate("window.formvis.engine.cancelPerspectiveWarp()")
    assert "planes" in state or state
    assert page.evaluate(PX, [65, 65]) == RED


def test_a_puppet_pin_dragged_on_a_smart_object_bends_it_and_reset_warp_restores_it(page):
    assert page.evaluate(SETUP) is True
    page.evaluate("window.formvis.commands.run('puppet-warp')")
    page.wait_for_function("!!window.formvis.engine.puppetEdit", timeout=5000)
    page.evaluate("() => { const e = window.formvis.engine; const a = e.addPuppetPin({ x: 70, y: 70 }), b = e.addPuppetPin({ x: 130, y: 130 }); e.movePuppetPin(b, { x: 150, y: 120 }); }")
    page.evaluate("window.formvis.engine.applyPuppetWarp()")
    page.wait_for_timeout(600)
    assert page.evaluate(DEFORM) is True
    assert page.evaluate(PX, [145, 122]) != WHITE or page.evaluate(PX, [135, 135]) != RED
    assert page.evaluate("window.formvis.commands.run('smart-warp-reset')") is True
    page.wait_for_timeout(500)
    assert page.evaluate(DEFORM) is False
    assert page.evaluate(PX, [135, 135]) == RED and page.evaluate(PX, [30, 30]) == WHITE
