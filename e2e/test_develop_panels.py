DEV = """async ([pattern, patch]) => {
  const D = await import('/src/engine/develop.ts'), W = 80, H = 60, img = new ImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let v = [128, 128, 128];
    if (pattern === 'ramp') { const g = Math.round((x / (W - 1)) * 255); v = [g, g, g]; }
    if (pattern === 'colour') v = [200, 80, 40];
    if (pattern === 'edge') v = x < 60 ? [20, 20, 20] : [235, 235, 235];
    d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255;
  }
  const s = D.defaultDevelopState();
  for (const [k, v] of Object.entries(patch)) {
    const path = k.split('.'); let o = s; for (const p of path.slice(0, -1)) o = o[p]; o[path[path.length - 1]] = v;
  }
  const out = D.developImage(img, s).data, px = (x, y) => Array.from(out.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
  return { dark: px(4, 30), mid: px(40, 30), corner: px(0, 0), centre: px(40, 30), edge: [62, 64, 66].map((x) => px(x, 30)) };
}"""


def dev(page, pattern, **patch):
    return page.evaluate(DEV, [pattern, {k.replace("__", "."): v for k, v in patch.items()}])


def test_the_new_panels_at_their_defaults_change_nothing(page):
    same = page.evaluate("""async () => {
      const D = await import('/src/engine/develop.ts'), img = new ImageData(40, 30);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = (i / 4) % 40 * 6; img.data[i + 1] = 90; img.data[i + 2] = 200; img.data[i + 3] = 255; }
      const now = D.defaultDevelopState(); now.tone.exposure = 40; now.tone.contrast = 20;
      const old = JSON.parse(JSON.stringify(now)); delete old.grading; delete old.optics; delete old.geometry; delete old.calibration;
      const a = D.developImage(img, now).data, b = D.developImage(img, old).data;
      return a.every((v, i) => v === b[i]);
    }""")
    assert same is True                     # a state saved before these panels renders exactly as before


def test_colour_grading_tints_the_shadows_and_keeps_their_luminance(page):
    base, blue = dev(page, "ramp"), dev(page, "ramp", grading__shadows={"h": 220, "s": 80})
    r, g, b, _ = blue["dark"]
    assert b > r + 4, blue
    lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
    assert abs(lum(blue["dark"]) - lum(base["dark"])) <= 3, (base, blue)


def test_calibration_shadow_tint_turns_dark_greys_magenta(page):
    r, g, b, _ = dev(page, "ramp", calibration__shadowTint=100)["dark"]
    assert r > g and b > g, (r, g, b)


def test_optics_vignetting_and_chromatic_aberration(page):
    v = dev(page, "flat", optics__vignetting=80, optics__midpoint=20)
    assert v["corner"][0] > 150 and abs(v["centre"][0] - 128) <= 2, v
    # Chromatic aberration scales red and blue apart by up to 0.6 percent of the distance from the centre, so it is
    # measured on a wide image near its border, where that is about 2 px (in an 80 px image it would be a tenth of one).
    ca = page.evaluate("""async () => {
      const D = await import('/src/engine/develop.ts'), W = 400, H = 40, img = new ImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, v = x < 380 ? 20 : 235; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      const s = D.defaultDevelopState(); s.optics.chromatic = 100;
      const o = D.developImage(img, s).data;
      return [376, 378, 379, 380, 381, 383].map((x) => { const i = (20 * W + x) * 4; return [o[i], o[i + 1], o[i + 2]]; });
    }""")
    assert any(abs(p[0] - p[2]) > 40 for p in ca), ca                # red and blue part at the edge


def test_geometry_rotation_leaves_the_corners_empty(page):
    r = dev(page, "flat", geometry__rotate=10)
    assert r["corner"][3] == 0 and r["centre"][3] == 255, r


def test_the_point_curve_and_colour_mixer_now_reached_from_develop_work(page):
    dark = dev(page, "flat", curves__rgb=[{"x": 0, "y": 0}, {"x": 128, "y": 60}, {"x": 255, "y": 255}])
    assert dark["mid"][0] < 90, dark
    grey = dev(page, "colour", color__master={"h": 0, "s": -100, "l": 0})
    r, g, b, _ = grey["mid"]
    assert max(r, g, b) - min(r, g, b) <= 6, grey


def test_the_develop_dialog_shows_every_panel(page):
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'D', 'white')")
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    notes = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-note')].filter((n) => n.offsetParent !== null).map((n) => n.textContent)")
    for heading in ("Point Curve", "Colour Mixer", "Colour Grading", "Optics", "Geometry", "Calibration"):
        assert heading in notes, (heading, notes)
    assert page.evaluate("!!document.querySelector('.cv-scrim:not([hidden]) canvas.cv-curves')?.offsetParent")
    page.keyboard.press("Escape")
