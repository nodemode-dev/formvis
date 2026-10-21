SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"

MAKE = """([kind, stroked]) => { const e = window.formvis.engine; e.newDocument(300, 200, 'W', 'white'); e.setTool('move');
  e.fg = { r: 200, g: 30, b: 30 }; e.bg = { r: 0, g: 0, b: 200 }; e.shapeSettings.kind = kind; e.shapeSettings.cornerRadius = 0;
  e.shapeSettings.stroke = stroked ? 'bg' : 'none'; e.shapeSettings.strokeWidth = 6;
  if (stroked) e.drawShape({ x: 60, y: 50 }, { x: 220, y: 140 }, { x: 60, y: 50, w: 160, h: 90 }); else e.createShape({ x: 60, y: 50, w: 160, h: 90 });
  const l = e.activeLayer; return { shape: !!l.shape, vector: !!l.vector, w: l.transform.w }; }"""
STATE = """() => { const l = window.formvis.engine.activeLayer; return { shape: !!l.shape, vector: !!l.vector, w: l.transform.w, stroke: l.vector && l.vector.stroke ? l.vector.stroke.width : null,
  anchors: l.vector ? l.vector.path.subpaths.reduce((a, s) => a + s.anchors.length, 0) : 0, fill: l.vector ? l.vector.fill : null, x0: l.vector ? l.vector.path.subpaths[0].anchors[0].x : null }; }"""
FLAT = """() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 300, 200).data)"""
WARP_PRESET = """([kind, rasterize, preset]) => { const e = window.formvis.engine; e.newDocument(300, 200, 'W', 'white'); e.setTool('move');
  e.fg = { r: 200, g: 30, b: 30 }; e.shapeSettings.kind = kind; e.shapeSettings.cornerRadius = 0; e.createShape({ x: 60, y: 50, w: 160, h: 90 });
  if (rasterize) e.rasterizeLayers('shape');
  if (!e.beginMeshWarp()) throw new Error('no warp'); e.setMeshWarpPreset(preset); e.applyMeshWarp(); }"""


def dilate(m):
    o = [row[:] for row in m]
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for y in range(len(m)):
                yy = y + dy
                if 0 <= yy < len(m):
                    row = m[yy]
                    for x in range(len(m[0])):
                        xx = x + dx
                        if 0 <= xx < len(row) and row[xx]:
                            o[y][x] = True
    return o


def mask(px):
    return [[px[(y * 300 + x) * 4 + 1] < 128 for x in range(300)] for y in range(200)]


def outside(a, b):
    d = dilate(b)
    return sum(1 for y in range(200) for x in range(300) if a[y][x] and not d[y][x])


def test_warp_by_dragging_a_mesh_point_keeps_a_plain_rectangle_a_vector_shape_and_undo_restores_it(page):
    # PC-EN-0218
    assert page.evaluate(MAKE, ["rectangle", False]) == {"shape": True, "vector": False, "w": 160}
    before = page.evaluate(FLAT)
    page.evaluate("window.formvis.commands.run('transform-warp')")
    page.wait_for_function("window.formvis.engine.meshWarpEdit")
    pt = page.evaluate("window.formvis.engine.meshWarpEdit.points[1]")
    x, y = page.evaluate(SCR, pt)
    x2, y2 = page.evaluate(SCR, [pt[0] + 12, pt[1] - 22])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=6)
    page.mouse.up()
    moved = page.evaluate("window.formvis.engine.meshWarpEdit.points[1]")
    assert abs(moved[0] - pt[0]) > 8 and abs(moved[1] - pt[1]) > 15, moved
    page.keyboard.press("Enter")
    page.wait_for_function("!window.formvis.engine.meshWarpEdit")
    after = page.evaluate(STATE)
    assert after["vector"] and not after["shape"] and after["anchors"] > 4, after
    assert after["fill"] == {"r": 200, "g": 30, "b": 30}
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Warp"
    assert page.evaluate(FLAT) != before
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(STATE)["vector"] is False
    assert page.evaluate(STATE)["shape"] is True
    assert page.evaluate(STATE)["w"] == 160


def test_a_preset_warp_of_a_rectangle_and_an_ellipse_matches_the_rasterized_warp_within_one_pixel(page):
    # PC-EN-0218
    for kind, preset in (("rectangle", {"style": "wave", "bend": 60}), ("ellipse", {"style": "arc", "bend": 50})):
        page.evaluate(WARP_PRESET, [kind, False, preset])
        state = page.evaluate(STATE)
        assert state["vector"] and not state["shape"], (kind, state)
        vec = mask(page.evaluate(FLAT))
        page.evaluate(WARP_PRESET, [kind, True, preset])
        assert page.evaluate(STATE)["vector"] is False
        ras = mask(page.evaluate(FLAT))
        assert sum(map(sum, vec)) > 8000 and sum(map(sum, ras)) > 8000
        assert outside(vec, ras) == 0, kind
        assert outside(ras, vec) == 0, kind


def test_warping_a_stroked_shape_keeps_its_stroke_and_fill_live(page):
    # PC-EN-0218
    page.evaluate(MAKE, ["ellipse", True])
    page.evaluate("window.formvis.commands.run('transform-warp', { style: 'fisheye', bend: 60 })")
    page.wait_for_function("window.formvis.engine.meshWarpEdit")
    page.keyboard.press("Enter")
    page.wait_for_function("!window.formvis.engine.meshWarpEdit")
    after = page.evaluate(STATE)
    assert after["vector"] and after["stroke"] == 6 and after["fill"] == {"r": 200, "g": 30, "b": 30}, after
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(STATE)["w"] == 168


def test_distort_and_perspective_keep_a_plain_shape_a_vector_shape(page):
    # PC-EN-0218
    for kind in ("rectangle", "ellipse"):
        for mode in ("distort", "perspective"):
            page.evaluate(MAKE, [kind, False])
            page.evaluate(f"window.formvis.commands.run('transform-{mode}')")
            page.wait_for_function("window.formvis.engine.distortEdit")
            page.evaluate("""() => { const e = window.formvis.engine, c = e.distortEdit.corners;
              e.distortEdit.corners = c.map((p, i) => (i === 1 ? { x: p.x + 30, y: p.y - 20 } : i === 2 ? { x: p.x - 20, y: p.y + 15 } : p)); }""")
            page.keyboard.press("Enter")
            page.wait_for_function("!window.formvis.engine.distortEdit")
            after = page.evaluate(STATE)
            assert after["vector"] and not after["shape"] and after["w"] != 160, (kind, mode, after)
            page.evaluate("window.formvis.engine.undo()")
            back = page.evaluate(STATE)
            assert back["shape"] and not back["vector"] and back["w"] == 160, (kind, mode, back)
