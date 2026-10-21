PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
SQUARE = """async (fx) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'S', 'white'); e.addLayer(); e.fg = { r: 200, g: 40, b: 40 };
  e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  if (fx) { const base = E.defaultEffects(); for (const [k, v] of Object.entries(fx)) Object.assign(base[k], v); e.setLayerEffects(e.current.activeLayer.id, base); }
}"""
K = {"r": 0, "g": 0, "b": 0}
RED = [200, 40, 40]
px = lambda page, x, y: page.evaluate(PX, [x, y])
near = lambda a, b, d=3: all(abs(i - j) <= d for i, j in zip(a, b))


def test_inner_glow_darkens_the_edge_and_the_centre_source_darkens_the_middle(page):
    page.evaluate(SQUARE, {"innerGlow": {"enabled": True, "color": K, "opacity": 1, "blend": "normal", "size": 12}})
    assert px(page, 100, 50) == RED and px(page, 82, 50)[0] < 150 and px(page, 100, 32)[0] < 150
    page.evaluate(SQUARE, {"innerGlow": {"enabled": True, "color": K, "opacity": 1, "blend": "normal", "size": 30, "source": "center"}})
    assert px(page, 100, 50)[0] < 90 and px(page, 100, 50)[0] < px(page, 82, 50)[0]


def test_inner_shadow_falls_on_the_side_away_from_its_angle_and_inside_the_shape(page):
    page.evaluate(SQUARE, {"innerShadow": {"enabled": True, "color": K, "opacity": 1, "blend": "normal", "angle": 0, "distance": 10, "size": 0}})
    assert px(page, 118, 50) == [0, 0, 0] and px(page, 100, 50) == RED and px(page, 82, 50) == RED
    assert px(page, 125, 50) == [255, 255, 255]


def test_satin_shades_the_edges_and_leaves_the_middle(page):
    page.evaluate(SQUARE, {"satin": {"enabled": True, "color": K, "opacity": 1, "blend": "normal", "angle": 0, "distance": 12, "size": 4, "invert": False}})
    assert px(page, 82, 50) == [0, 0, 0] and px(page, 118, 50) == [0, 0, 0] and px(page, 100, 50) == RED


def test_gradient_overlay_runs_dark_to_light_across_the_layer_and_stays_inside_the_shape(page):
    page.evaluate(SQUARE, {"gradientOverlay": {"enabled": True, "from": K, "to": {"r": 255, "g": 255, "b": 255}, "opacity": 1, "blend": "normal", "angle": 0, "style": "linear", "scale": 1, "reverse": False}})
    left, mid, right = px(page, 82, 50), px(page, 100, 50), px(page, 118, 50)
    assert left[0] < mid[0] < right[0] and left[0] == left[1] == left[2]
    assert px(page, 60, 50) == [255, 255, 255]
    page.evaluate(SQUARE, {"gradientOverlay": {"enabled": True, "from": K, "to": {"r": 255, "g": 255, "b": 255}, "opacity": 1, "blend": "normal", "angle": 0, "style": "linear", "scale": 1, "reverse": True}})
    assert px(page, 82, 50)[0] > px(page, 118, 50)[0]


def test_pattern_overlay_replaces_the_fill_with_the_pattern_inside_the_shape_only(page):
    page.evaluate(SQUARE, {"patternOverlay": {"enabled": True, "pattern": "builtin:checker", "opacity": 1, "blend": "normal", "scale": 1}})
    seen = {tuple(px(page, x, y)) for x in range(84, 118, 4) for y in range(34, 68, 4)}
    assert RED not in [list(s) for s in seen] and seen <= {(0, 0, 0), (255, 255, 255)} and len(seen) == 2, seen
    assert px(page, 60, 50) == [255, 255, 255]


def test_bevel_lights_the_edge_facing_the_light_and_darkens_the_far_one(page):
    page.evaluate(SQUARE, {"bevel": {"enabled": True, "style": "inner", "depth": 100, "size": 8, "angle": 120, "altitude": 30}})
    top, right, centre = px(page, 100, 32), px(page, 118, 50), px(page, 100, 50)
    assert centre == RED and top[1] > 120 and right[0] < 100, (top, right)


def test_green_channel_off_keeps_what_lies_below_in_green(page):
    page.evaluate(SQUARE, None)
    assert px(page, 100, 50) == RED
    page.evaluate("window.formvis.engine.current.updateLayer(window.formvis.engine.current.activeId, { blendChannels: [true, false, true] })")
    assert px(page, 100, 50) == [200, 255, 40]
    page.evaluate("window.formvis.engine.current.updateLayer(window.formvis.engine.current.activeId, { blendChannels: null })")
    assert px(page, 100, 50) == RED


SCENE_BLEND = """async (mode) => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  const all = () => E.SelectionMask.cropped(0, 0, 20, 20, new Uint8Array(400).fill(255));
  if (!e.current || e.current.doc.name !== 'BL' || e.current.doc.layers.length < 2) { e.newDocument(20, 20, 'BL', 'white');
    e.fg = { r: 200, g: 100, b: 50 }; e.applySelection(all(), 'replace', 's'); e.fill('fg');
    e.addLayer(); e.fg = { r: 100, g: 150, b: 200 }; e.applySelection(all(), 'replace', 's'); e.fill('fg'); e.deselect(); }
  e.current.updateLayer(e.current.activeId, { blend: mode }); }"""


def test_blend_modes_give_their_own_values_including_the_extra_four(page):
    want = {"normal": [100, 150, 200], "multiply": [79, 59, 40], "screen": [222, 191, 211], "difference": [100, 50, 150],
            "negation": [210, 250, 250], "reflect": [255, 95, 45], "glow": [182, 145, 195], "xor": [172, 242, 250],
            "darken": [100, 100, 50], "lighten": [200, 150, 200]}
    for mode, rgb in want.items():
        page.evaluate(SCENE_BLEND, mode)
        assert near(px(page, 10, 10), rgb), (mode, px(page, 10, 10), rgb)


def test_a_folder_is_pass_through_until_isolated_and_a_multiply_child_sees_the_backdrop_only_in_pass_through(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(60, 40, 'G', 'white');
      const all = () => E.SelectionMask.cropped(0, 0, 60, 40, new Uint8Array(2400).fill(255));
      e.fg = { r: 200, g: 200, b: 0 }; e.applySelection(all(), 'replace', 's'); e.fill('fg');
      e.addLayer(); e.fg = { r: 100, g: 150, b: 200 };
      e.applySelection(E.SelectionMask.cropped(10, 10, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      e.current.updateLayer(e.current.activeId, { blend: 'multiply' }); }""")
    assert near(px(page, 20, 20), [79, 118, 0])
    assert page.evaluate("window.formvis.commands.run('group')") is True
    folder = "window.formvis.engine.current.doc.layers.find((l) => l.isGroup)"
    assert page.evaluate(f"!!{folder} && {folder}.isolate !== true")
    assert near(px(page, 20, 20), [79, 118, 0])
    page.evaluate(f"window.formvis.engine.current.updateLayer({folder}.id, {{ isolate: true }})")
    assert near(px(page, 20, 20), [100, 150, 200])
    assert near(px(page, 50, 30), [200, 200, 0])
