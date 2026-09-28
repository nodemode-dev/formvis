SQUARE = """(fx) => {
  const e = window.formvis.engine, d = JSON.parse(JSON.stringify(fx));
  e.newDocument(200, 100, 'S', 'white');
  e.addLayer();
  return import('/src/engine/index.ts').then((E) => {
    e.fg = { r: 220, g: 30, b: 30 };
    e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
    const base = E.defaultEffects();
    for (const [k, v] of Object.entries(d)) Object.assign(base[k], v);
    e.setLayerEffects(e.current.activeLayer.id, base);
  });
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
black = lambda p: max(p) < 60
red = lambda p: p[0] > 180 and p[1] < 80
white = lambda p: min(p) > 220


def test_stroke_positions(page):
    for pos, expect in [("outside", [(77, "black"), (83, "red")]), ("inside", [(77, "white"), (83, "black")]), ("center", [(74, "white"), (78, "black"), (82, "black"), (86, "red")])]:
        page.evaluate(SQUARE, {"stroke": {"enabled": True, "size": 6, "position": pos, "color": {"r": 0, "g": 0, "b": 0}}})
        for x, want in expect:
            p = page.evaluate(PX, [x, 50])
            assert {"black": black, "red": red, "white": white}[want](p), (pos, x, p)


def test_global_light_moves_a_shadow_that_uses_it(page):
    page.evaluate(SQUARE, {"dropShadow": {"enabled": True, "opacity": 1, "distance": 12, "size": 0, "angle": 180, "useGlobal": True}})
    # own angle 180 would cast to the right; the default global light (120) casts down and to the right
    page.evaluate("window.formvis.engine.applyStyleAndLight(window.formvis.engine.current.activeLayer.id, window.formvis.engine.current.activeLayer.effects, { angle: 0, altitude: 30 })")
    # light from the right (0) casts the shadow to the left
    left, right = page.evaluate(PX, [72, 50]), page.evaluate(PX, [128, 50])
    assert max(left) < 120 and white(right), (left, right)
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Layer Style"
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.doc.globalLight") is None
    rt = page.evaluate("""async () => { const e = window.formvis.engine; e.redo(); const io = await import('/src/io/project-io.ts');
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const d = (await io.deserialize(manifest, (n) => Promise.resolve(m.get(n)))).doc, l = d.layers[d.layers.length - 1];
      return [d.globalLight, l.effects.dropShadow.useGlobal]; }""")
    assert rt == [{"angle": 0, "altitude": 30}, True], rt


def test_cone_contour_moves_the_glow_off_the_edge(page):
    page.evaluate(SQUARE, {"outerGlow": {"enabled": True, "opacity": 1, "size": 20, "blend": "normal", "color": {"r": 0, "g": 0, "b": 0}}})
    near, mid = page.evaluate(PX, [78, 50])[0], page.evaluate(PX, [70, 50])[0]
    assert near < mid, (near, mid)
    page.evaluate(SQUARE, {"outerGlow": {"enabled": True, "opacity": 1, "size": 20, "blend": "normal", "color": {"r": 0, "g": 0, "b": 0}, "contour": "cone"}})
    near2, mid2 = page.evaluate(PX, [78, 50])[0], page.evaluate(PX, [70, 50])[0]
    assert near2 > mid2 and near2 > near, (near2, mid2, near)
