import pytest

# A test image, a filter from blur-gallery.ts, and measurements: brightness at points, and the spread (variance) of a
# region, which blurring lowers.
RUN = """async ([pattern, fn, args]) => {
  const G = await import('/src/engine/blur-gallery.ts'), W = 100, H = 100, img = new ImageData(W, H), d = img.data;
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let v = 0;
    if (pattern === 'dot') v = Math.hypot(x - 70, y - 50) < 2 ? 255 : 0;
    if (pattern === 'checker') v = ((x >> 2) + (y >> 2)) % 2 ? 230 : 25;
    if (pattern === 'halves') v = (x < 50 ? 60 : 200) + Math.round((rnd() - 0.5) * 30);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  const out = G[fn](img, ...args), o = out.data;
  const at = (x, y) => o[(y * W + x) * 4];
  const spread = (x0, y0, x1, y1, src = o) => { let s = 0, s2 = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = src[(y * W + x) * 4]; s += v; s2 += v * v; n++; } return s2 / n - (s / n) ** 2; };
  return {
    up: at(70, 44), side: at(78, 50), edgeL: at(48, 50), edgeR: at(51, 50),
    centre: spread(40, 40, 60, 60), corner: spread(0, 0, 20, 20), top: spread(0, 0, 100, 10), middle: spread(0, 45, 100, 55),
    left: spread(5, 40, 25, 60), right: spread(75, 40, 95, 60), leftBefore: spread(5, 40, 25, 60, d), rightBefore: spread(75, 40, 95, 60, d),
  };
}"""


def run(page, pattern, fn, *args):
    return page.evaluate(RUN, [pattern, fn, list(args)])


def test_radial_spin_blurs_around_the_centre_and_zoom_away_from_it(page):
    spin = run(page, "dot", "radialBlur", 60, "spin", 50, 50, "best")
    zoom = run(page, "dot", "radialBlur", 60, "zoom", 50, 50, "best")
    assert spin["up"] > spin["side"], spin              # along the circle: up and down
    assert zoom["side"] > zoom["up"], zoom              # along the ray: outward


def test_surface_blur_smooths_flat_areas_and_keeps_the_edge(page):
    r = run(page, "halves", "surfaceBlur", 6, 40)
    assert r["left"] < r["leftBefore"] / 3 and r["right"] < r["rightBefore"] / 3, r
    assert r["edgeL"] < 100 and r["edgeR"] > 160, r      # no bleed across the 60 to 200 edge


def test_iris_is_sharp_inside_and_blurred_outside(page):
    r = run(page, "checker", "irisBlur", 12, 50, 50, 25, 25, 0, 60)
    b = run(page, "checker", "irisBlur", 0, 50, 50, 25, 25, 0, 60)
    assert r["centre"] > b["centre"] * 0.9 and r["corner"] < b["corner"] / 4, (r, b)


def test_tilt_shift_is_sharp_in_its_band_and_blurred_away_from_it(page):
    r = run(page, "checker", "tiltShift", 12, 50, 0, 10, 15)
    assert r["middle"] > r["top"] * 4, r


def test_field_blur_follows_its_pins(page):
    r = run(page, "checker", "fieldBlur", [{"x": 15, "y": 50, "blur": 0}, {"x": 85, "y": 50, "blur": 20}])
    assert r["left"] > r["leftBefore"] * 0.8 and r["right"] < r["rightBefore"] / 4, r


def test_path_blur_smears_along_the_path(page):
    r = run(page, "dot", "pathBlur", 30, [10, 50], [50, 50], [90, 50], 0)
    assert r["side"] > r["up"], r                        # a horizontal path: along x, not y


def test_the_worker_gives_the_dialogs_result(page):
    same = page.evaluate("""async () => {
      const P = await import('/src/ui/panels/filter-panel.ts'), E = await import('/src/engine/index.ts');
      const img = new ImageData(60, 40); for (let i = 0; i < img.data.length; i += 4) { img.data[i] = (i / 4) % 60 * 4; img.data[i + 1] = 90; img.data[i + 2] = 30; img.data[i + 3] = 255; }
      const s = P.defaultFilterSettings(), main = P.runFilter('tiltShift', s, 0, img, 1);
      const job = E.runFilterOffThread('tiltShift', s, 1, 0, new ImageData(new Uint8ClampedArray(img.data), 60, 40));
      if (!job) return 'no worker';
      const off = await job;
      return main.data.every((v, i) => v === off.data[i]);
    }""")
    assert same is True, same


@pytest.mark.parametrize("kind", ["radialBlur", "surfaceBlur", "fieldBlur", "irisBlur", "tiltShift", "pathBlur"])
def test_each_opens_from_its_menu_with_its_controls(page, kind):
    page.evaluate("window.sonny.engine.newDocument(80, 60, 'B', 'white')")
    assert page.evaluate(f"window.sonny.commands.run('filter-{kind}')")
    shown = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-field')].filter((n) => n.offsetParent !== null && (n.querySelector('input[type=range]') || n.querySelector('select'))).length")
    assert shown >= 2, shown
    page.keyboard.press("Escape")
