import pytest

RUN = """async ([kind, values, pattern]) => {
  const P = await import('/src/engine/adjust-params.ts');
  const W = 64, px = new Uint8ClampedArray(W * W * 4);
  for (let i = 0; i < px.length; i += 4) {
    const x = (i / 4) % W, y = Math.floor(i / 4 / W);
    const v = pattern === 'edge' ? (x < W / 2 ? 90 : 150) : pattern === 'colour' ? null : x * 4;
    if (v === null) { px[i] = 200; px[i + 1] = 90; px[i + 2] = 40; } else { px[i] = px[i + 1] = px[i + 2] = v; }
    px[i + 3] = 255;
  }
  const before = Array.from(px);
  P.paramKernel(kind, values)(px, { width: W, height: W, originX: 0, originY: 0, unitsPerPixel: 1 });
  const at = (a, x, y) => Array.from(a.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
  return { before: [at(before, 2, 32), at(before, 32, 32), at(before, 62, 32)], after: [at(px, 2, 32), at(px, 32, 32), at(px, 62, 32)],
    edge: [at(px, 28, 32)[0], at(px, 36, 32)[0]], edgeBefore: [at(before, 28, 32)[0], at(before, 36, 32)[0]] };
}"""

IDENTITY = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n"
INVERT = "TITLE \"invert\"\nLUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n"


def test_shadows_highlights_lifts_shadows_and_recovers_highlights(page):
    lift = page.evaluate(RUN, ["shadowsHighlights", {}, "ramp"])
    assert lift["after"][0][0] > lift["before"][0][0] and abs(lift["after"][2][0] - lift["before"][2][0]) <= 3, lift
    recover = page.evaluate(RUN, ["shadowsHighlights", {"shadowAmount": 0, "highlightAmount": 80}, "ramp"])
    assert recover["after"][2][0] < recover["before"][2][0] - 5, recover


def test_hdr_toning_raises_local_contrast_with_detail(page):
    flat = page.evaluate(RUN, ["hdrToning", {"detail": 0, "saturation": 0}, "edge"])
    sharp = page.evaluate(RUN, ["hdrToning", {"detail": 200, "saturation": 0}, "edge"])
    assert sharp["edge"][1] - sharp["edge"][0] > flat["edge"][1] - flat["edge"][0], (flat, sharp)


def test_color_lookup_applies_a_cube_file_exactly_and_the_built_in_looks(page):
    same = page.evaluate(RUN, ["colorLookup", {"cube": IDENTITY}, "colour"])
    assert same["after"] == same["before"], same
    inv = page.evaluate(RUN, ["colorLookup", {"cube": INVERT}, "colour"])
    assert inv["after"][0] == [255 - c for c in inv["before"][0]], inv
    assert page.evaluate("import('/src/engine/adjust-params.ts').then((P) => P.parseCube('not a lut'))") is None
    mono = page.evaluate(RUN, ["colorLookup", {"look": "mono"}, "colour"])
    r, g, b = mono["after"][0]
    assert max(r, g, b) - min(r, g, b) <= 12, mono                     # near neutral, warm-tinted


@pytest.mark.parametrize("kind,visible", [("shadowsHighlights", 8), ("hdrToning", 7), ("colorLookup", 2)])
def test_each_is_an_adjustment_layer_from_the_menu_with_its_controls_showing(page, kind, visible):
    shown = """[...document.querySelectorAll('.cv-panel-section .cv-field')].filter((n) => n.offsetParent !== null
      && (n.querySelector('input[type=range]') || n.querySelector('select') || n.classList.contains('cv-lut-row'))).length"""
    page.evaluate("window.sonny.engine.newDocument(80, 60, 'A', 'white')")
    # Layer > New Adjustment Layer: a live adjustment layer of this kind, its dialog showing every control.
    assert page.evaluate(f"window.sonny.commands.run('new-adj-{kind}')")
    assert page.evaluate("window.sonny.engine.current.activeLayer.adjustment.kind") == kind
    assert page.evaluate(shown) >= visible                            # none hidden by a stray group
    page.keyboard.press("Escape")
    # Image > Adjustments: the same controls as a direct edit of the background's pixels.
    page.evaluate("(() => { const p = window.sonny.engine.current; p.activeId = p.doc.layers[0].id; })()")
    assert page.evaluate(f"window.sonny.commands.run('adj-{kind}')")
    assert page.evaluate(shown) >= visible
    page.keyboard.press("Escape")


def test_the_settings_and_the_cube_file_survive_saving_and_reopening(page):
    r = page.evaluate("""async (cube) => {
      const S = await import('/src/io/project-io.ts'), e = window.sonny.engine;
      e.newDocument(40, 30, 'A', 'white'); e.addAdjustmentLayer('colorLookup');
      const l = e.current.activeLayer; l.adjustment.data.params = { look: 'night', cube, cubeName: 'invert.cube' };
      e.addAdjustmentLayer('shadowsHighlights'); e.current.activeLayer.adjustment.data.params = { shadowAmount: 70, highlightRadius: 120 };
      const out = await S.serialize(e.current.doc, e.current.activeId);
      const files = out.files, get = async (n) => files.find((f) => f.name === n).blob;
      const back = await S.deserialize(JSON.parse(JSON.stringify(out.manifest)), get);
      const adj = back.doc.layers.filter((x) => x.adjustment).map((x) => ({ kind: x.adjustment.kind, params: x.adjustment.data.params }));
      return adj;
    }""", INVERT)
    kinds = {a["kind"]: a["params"] for a in r}
    assert kinds["colorLookup"]["cube"] == INVERT and kinds["colorLookup"]["cubeName"] == "invert.cube" and kinds["colorLookup"]["look"] == "night", r
    assert kinds["shadowsHighlights"]["shadowAmount"] == 70 and kinds["shadowsHighlights"]["highlightRadius"] == 120, r
