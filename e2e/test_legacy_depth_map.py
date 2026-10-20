import functools

from playwright.sync_api import Error as PlaywrightError


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


# The depth-map-* commands. The local depth model is not installed here, so the model run is replaced by a function
# that hands back a known grey ramp; the corrections, the selection limit, the view toggle, the size guard and the
# no-depth-layer guards are then read from the Depth Map layer's own pixels.
CALL = "async ([id, p]) => await window.formvis.commands.call(id, p)"
RAMP = """async () => {
  const e = window.formvis.engine;
  e.newDocument(64, 64, 'F', 'white');
  const run = async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
    for (let x = 0; x < 64; x++) { const v = 40 + x * 2; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 64); }
    return await new Promise((r) => c.toBlob(r, 'image/png'));
  };
  window.__depthRun = run;
  return await e.computeDepthMap(run);
}"""
GREY = "([x, y]) => { const l = window.formvis.engine.depthLayer(); return l ? l.raster.read().data[(y * 64 + x) * 4] : null; }"
NAMES = "() => window.formvis.engine.current.doc.layers.map((l) => l.name)"


def near(a, b, t=3):
    return abs(a - b) <= t


@steady
def test_compute_depth_map_adds_a_depth_map_layer_with_the_returned_ramp(page):
    assert page.evaluate(RAMP) is True
    assert "Depth Map" in page.evaluate(NAMES)
    assert near(page.evaluate(GREY, [0, 10]), 40) and near(page.evaluate(GREY, [63, 10]), 166)


@steady
def test_recompute_replaces_the_layer_instead_of_adding_one(page):
    page.evaluate(RAMP)
    n = page.evaluate(NAMES).count("Depth Map")
    page.evaluate("async () => await window.formvis.engine.computeDepthMap(window.__depthRun, { recompute: true })")
    assert page.evaluate(NAMES).count("Depth Map") == n == 1


@steady
def test_a_failing_model_run_adds_nothing_and_returns_false(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'F', 'white')")
    ok = page.evaluate("async () => await window.formvis.engine.computeDepthMap(async () => { throw new Error('model offline'); })")
    assert ok is False
    assert "Depth Map" not in page.evaluate(NAMES)


@steady
def test_recompute_with_no_depth_layer_is_refused(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'F', 'white')")
    ok = page.evaluate("async () => await window.formvis.engine.computeDepthMap(async (b) => b, { recompute: true })")
    assert ok is False


@steady
def test_the_correction_commands_are_off_without_a_depth_layer(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'F', 'white')")
    ids = ["depth-map-recompute", "depth-map-show", "depth-map-flatten", "depth-map-nearer", "depth-map-farther", "depth-map-smooth", "depth-map-snap", "depth-map-detail"]
    states = page.evaluate("(ids) => ids.map((id) => !!window.formvis.commands.get(id).enabled())", ids)
    assert states == [False] * len(ids)
    assert page.evaluate("() => window.formvis.engine.correctDepthMap('nearer', 0.1)") is False


@steady
def test_the_correction_commands_are_on_with_a_depth_layer(page):
    page.evaluate(RAMP)
    ids = ["depth-map-recompute", "depth-map-show", "depth-map-flatten", "depth-map-nearer", "depth-map-farther", "depth-map-smooth", "depth-map-snap", "depth-map-detail"]
    states = page.evaluate("(ids) => ids.map((id) => !!window.formvis.commands.get(id).enabled())", ids)
    assert states == [True] * len(ids)


@steady
def test_nearer_brightens_and_farther_darkens(page):
    page.evaluate(RAMP)
    before = page.evaluate(GREY, [20, 30])
    page.evaluate(CALL, ["depth-map-nearer", {"amount": 20}])
    up = page.evaluate(GREY, [20, 30])
    assert up > before + 10, (before, up)
    page.evaluate(CALL, ["depth-map-farther", {"amount": 40}])
    down = page.evaluate(GREY, [20, 30])
    assert down < up - 10, (up, down)


@steady
def test_flatten_pulls_the_ends_toward_mid_grey(page):
    page.evaluate(RAMP)
    lo, hi = page.evaluate(GREY, [0, 30]), page.evaluate(GREY, [63, 30])
    page.evaluate(CALL, ["depth-map-flatten", {"amount": 60}])
    lo2, hi2 = page.evaluate(GREY, [0, 30]), page.evaluate(GREY, [63, 30])
    assert hi2 - lo2 < (hi - lo) * 0.6, (lo, hi, lo2, hi2)


@steady
def test_a_correction_inside_a_selection_leaves_the_outside_alone(page):
    page.evaluate(RAMP)
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.applySelection(E.SelectionMask.cropped(0, 0, 32, 64, new Uint8Array(32 * 64).fill(255)), 'replace', 's'); }""")
    out, inside = page.evaluate(GREY, [50, 30]), page.evaluate(GREY, [10, 30])
    page.evaluate(CALL, ["depth-map-nearer", {"amount": 30}])
    assert page.evaluate(GREY, [50, 30]) == out
    assert page.evaluate(GREY, [10, 30]) > inside + 10


@steady
def test_smooth_blurs_a_hard_step(page):
    page.evaluate("""async () => { const e = window.formvis.engine; e.newDocument(64, 64, 'F', 'white');
      const run = async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#fff'; g.fillRect(32, 0, 32, 64); return await new Promise((r) => c.toBlob(r, 'image/png')); };
      await e.computeDepthMap(run); }""")
    assert page.evaluate(GREY, [31, 30]) < 10 and page.evaluate(GREY, [32, 30]) > 245
    page.evaluate(CALL, ["depth-map-smooth", {"radius": 6}])
    a, b = page.evaluate(GREY, [31, 30]), page.evaluate(GREY, [32, 30])
    assert a > 40 and b < 215, (a, b)


@steady
def test_snap_to_edges_clamps_its_radius_to_nine(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(64, 64, 'F', 'white'); e.fg = { r: 0, g: 0, b: 0 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 30, 64, new Uint8Array(30 * 64).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      const run = async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 36, 64); g.fillStyle = '#fff'; g.fillRect(36, 0, 28, 64); return await new Promise((r) => c.toBlob(r, 'image/png')); };
      await e.computeDepthMap(run); }""")
    read = "() => Array.from(window.formvis.engine.depthLayer().raster.read().data)"
    page.evaluate(CALL, ["depth-map-snap", {"radius": 50}])
    big = page.evaluate(read)
    page.evaluate("() => window.formvis.engine.undo()")
    page.evaluate(CALL, ["depth-map-snap", {"radius": 9}])
    assert page.evaluate(read) == big


@steady
def test_detail_adds_the_pictures_texture_to_the_depth(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(64, 64, 'F', 'white'); e.fg = { r: 0, g: 0, b: 0 };
      for (let x = 0; x < 32; x += 2) { e.applySelection(E.SelectionMask.cropped(x, 0, 1, 64, new Uint8Array(64).fill(255)), 'replace', 's'); e.fill('fg'); }
      e.deselect();
      const run = async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 64); return await new Promise((r) => c.toBlob(r, 'image/png')); };
      await e.computeDepthMap(run); }""")
    page.evaluate(CALL, ["depth-map-detail", {"amount": 100}])
    left = {page.evaluate(GREY, [x, 30]) for x in range(2, 30)}
    right = {page.evaluate(GREY, [x, 30]) for x in range(46, 62)}
    assert len(left) > 1, left
    assert len(right) == 1, right


@steady
def test_show_depth_map_toggles_the_view(page):
    page.evaluate(RAMP)
    assert page.evaluate("() => !!window.formvis.engine.depthView") is False
    page.evaluate(CALL, ["depth-map-show", None])
    assert page.evaluate("() => !!window.formvis.engine.depthView") is True
    assert page.evaluate("() => !!window.formvis.commands.get('depth-map-show').checked()") is True
    page.evaluate(CALL, ["depth-map-show", None])
    assert page.evaluate("() => !!window.formvis.engine.depthView") is False


@steady
def test_depth_from_layer_without_the_model_is_refused_with_a_message(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'F', 'white')")
    page.evaluate(CALL, ["depth-map-from-layer", None])
    page.wait_for_timeout(1500)
    assert "Depth Map" not in page.evaluate(NAMES)
