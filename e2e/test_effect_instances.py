SQUARE = """async (fx) => {
  const e = window.sonny.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'S', 'white'); e.addLayer(); e.fg = { r: 30, g: 160, b: 30 };
  e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  if (fx) { const base = E.defaultEffects(); for (const [k, v] of Object.entries(fx)) if (k !== 'extra') Object.assign(base[k], v); if (fx.extra) base.extra = fx.extra; e.setLayerEffects(e.current.activeLayer.id, base); }
}"""
PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
black = lambda p: max(p) < 60
red = lambda p: p[0] > 180 and p[1] < 80 and p[2] < 80


def test_two_strokes_stack_the_later_above(page):
    page.evaluate(SQUARE, {"stroke": {"enabled": True, "size": 8, "color": {"r": 0, "g": 0, "b": 0}}, "extra": {"stroke": [{"enabled": True, "size": 3, "opacity": 1, "color": {"r": 220, "g": 20, "b": 20}}]}})
    assert red(page.evaluate(PX, [78, 50])) and black(page.evaluate(PX, [74, 50]))


def test_two_drop_shadows_both_show(page):
    shadow = lambda angle: {"enabled": True, "opacity": 1, "distance": 14, "size": 0, "angle": angle, "blend": "normal", "color": {"r": 0, "g": 0, "b": 0}}
    page.evaluate(SQUARE, {"dropShadow": shadow(0), "extra": {"dropShadow": [shadow(180)]}})
    assert black(page.evaluate(PX, [72, 50])) and black(page.evaluate(PX, [128, 50]))


def test_add_an_instance_through_the_dialog_and_save_it(page):
    page.evaluate(SQUARE, None)
    assert page.evaluate("window.sonny.commands.run('layer-style')") is True
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    stroke = d.locator(".cv-field", has_text="Stroke").first
    stroke.locator("input").check()
    # the Instances row that follows Stroke's checkbox
    rows = d.locator(".cv-field", has_text="Instances")
    stroke_row = rows.nth(1)
    stroke_row.locator("button", has_text="Add").click()
    assert stroke_row.locator("select").input_value() == "1"
    assert stroke_row.locator("button", has_text="Remove").is_enabled()
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(300)
    r = page.evaluate("""async () => { const e = window.sonny.engine, l = e.current.activeLayer, io = await import('/src/io/project-io.ts');
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const back = (await io.deserialize(manifest, (n) => Promise.resolve(m.get(n)))).doc.layers.find((x) => x.id === l.id);
      return [l.effects.stroke.enabled, (l.effects.extra?.stroke || []).length, (back.effects.extra?.stroke || []).length, e.historySteps.names.slice(-1)[0]]; }""")
    assert r == [True, 1, 1, "Layer Style"], r
