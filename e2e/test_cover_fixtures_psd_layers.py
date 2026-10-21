from e2e.fixtures_support import PIXEL, near, open_fixture, steady

SUMMARY = """() => { const d = window.formvis.engine.current.doc, by = (n) => d.layers.find((l) => l.name === n); const sub = (l) => l.vectorMask ? l.vectorMask.path.subpaths.length : null;
  const fx = by('Three shadows').effects;
  return { names: d.layers.map((l) => l.name), vm: by('Vector masked').vectorMask.inverted, vmi: by('Vector inverted').vectorMask.inverted, vmsub: sub(by('Vector masked')),
    shapeFill: by('Shape 1').vector ? by('Shape 1').vector.fill : null, shapeSub: by('Shape 1').vector ? by('Shape 1').vector.path.subpaths.length : null,
    ds: fx.dropShadow, extra: (fx.extra && fx.extra.dropShadow) || [], blendIf: by('Blend if').blendIf, mask: !!by('Masked').mask, big: by('Larger than canvas').transform,
    alphas: (d.alphas || []).map((a) => a.name), guides: d.guides, notes: (d.notes || []).map((n) => n.text) }; }"""


@steady
def test_a_hand_written_layered_psd_keeps_masks_vector_masks_shape_styles_blend_if_alpha_guides_and_notes(page, tmp_path):
    opened, report = open_fixture(page, "psd_layers.psd")
    assert opened
    s = page.evaluate(SUMMARY)
    assert s["names"] == ["Larger than canvas", "Red box", "Vector masked", "Vector inverted", "Masked", "Shape 1", "Three shadows", "Blend if"], s["names"]
    assert s["vm"] is False and s["vmi"] is True and s["vmsub"] == 1
    assert s["shapeFill"] == {"r": 10, "g": 150, "b": 200} and s["shapeSub"] == 1
    assert s["mask"] is True
    ds = [s["ds"]] + s["extra"]
    assert len(ds) == 3, ds
    assert [round(d["opacity"], 2) for d in ds] == [0.6, 0.7, 0.8] and [d["distance"] for d in ds] == [3, 4, 5] and [d["angle"] for d in ds] == [90, 120, 150], ds
    assert s["blendIf"]["thisLayer"] == [0, 40, 0, 60], s["blendIf"]
    assert s["alphas"] == ["Edge mask"]
    assert sorted((g["axis"], g["at"]) for g in s["guides"]) == [("x", 10), ("y", 16), ("y", 8)] or sorted((g["axis"], g["at"]) for g in s["guides"]) == sorted([("x", 10), ("y", 8), ("y", 16)])
    assert s["notes"] == ["Check this edge"]
    assert "1 alpha channel" in report and "cut to the canvas" in report, report
    assert s["big"]["w"] == 32 and s["big"]["h"] == 24 and s["big"]["x"] == 0


@steady
def test_the_layered_psd_composites_through_its_vector_masks_pixel_mask_and_shape(page, tmp_path):
    opened, report = open_fixture(page, "psd_layers.psd")
    assert opened
    assert near(page.evaluate(PIXEL, [30, 1]), (230, 200, 20), 2)
    assert near(page.evaluate(PIXEL, [14, 14]), (30, 60, 220), 2)
    assert near(page.evaluate(PIXEL, [14, 17]), (220, 30, 30), 2)
    assert near(page.evaluate(PIXEL, [3, 3]), (30, 200, 60), 2)
    assert near(page.evaluate(PIXEL, [10, 3]), (230, 200, 20), 2)
    assert near(page.evaluate(PIXEL, [26, 6]), (10, 150, 200), 2)
    assert near(page.evaluate(PIXEL, [31, 1]), (230, 200, 20), 2)
    px = page.evaluate(PIXEL, [26, 22])
    assert px[1] > 190 and px[2] < 100 and px[0] < 140, px


STRUCT = """() => { const d = window.formvis.engine.current.doc; return { layers: d.layers.map((l) => ({ n: l.name, g: !!l.isGroup, b: l.blend, c: !!l.collapsed, a: l.artboard || null, parent: l.parentId })), collapsed: d.collapsed }; }"""


@steady
def test_psd_groups_artboards_unknown_blend_modes_and_damage_report(page, tmp_path):
    opened, report = open_fixture(page, "psd_group.psd")
    assert opened
    st = page.evaluate(STRUCT)
    grp = [l for l in st["layers"] if l["g"]][0]
    assert grp["n"] == "Group A" and grp["b"] == "multiply", st
    opened, report = open_fixture(page, "psd_artboard.psd")
    assert opened
    ab = [l for l in page.evaluate(STRUCT)["layers"] if l["a"]]
    assert len(ab) == 1 and ab[0]["a"]["w"] == 32 and ab[0]["a"]["h"] == 24 and ab[0]["a"]["preset"] == "Custom" and ab[0]["a"]["background"] == {"r": 255, "g": 255, "b": 255}
    opened, report = open_fixture(page, "psd_unknown_blend.psd")
    assert opened
    blend = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.blend)")
    assert blend == ["normal", "darker-color"] or blend == ["normal", "darken"], blend
    names = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)")
    assert names == ["Base", "Unknown mode"], names
    opened, report = open_fixture(page, "psd_damaged_truncated.psd")
    assert opened and "cut short" in report, report
    names = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)")
    assert "Red box" in names and "Blend if" in names, names
    count = page.evaluate("window.formvis.engine.projects.length")
    opened, report = open_fixture(page, "psd_damaged_layers_cut.psd", wait=6)
    assert page.evaluate("window.formvis.engine.projects.length") == count + (1 if opened else 0)


FX2 = """() => { const fx = window.formvis.engine.current.doc.layers.find((l) => l.name === 'Three shadows').effects; const ex = fx.extra || {}; return { stroke: [fx.stroke, ...(ex.stroke || [])].map((s) => ({ on: s.enabled, size: s.size, op: Math.round(s.opacity * 100), c: s.color })), over: [fx.colorOverlay, ...(ex.colorOverlay || [])].map((s) => ({ on: s.enabled, op: Math.round(s.opacity * 100), c: s.color })) }; }"""


@steady
def test_two_strokes_and_two_colour_overlays_in_a_psd_style_both_survive(page, tmp_path):
    opened, report = open_fixture(page, "psd_layers.psd")
    assert opened
    fx = page.evaluate(FX2)
    assert [(s["on"], s["size"], s["op"]) for s in fx["stroke"]] == [(True, 2, 100), (True, 3, 80)], fx
    assert fx["stroke"][1]["c"] == {"r": 255, "g": 0, "b": 0}
    assert [(s["on"], s["op"]) for s in fx["over"]] == [(True, 50), (True, 70)], fx
    assert fx["over"][1]["c"] == {"r": 110, "g": 200, "b": 30}
