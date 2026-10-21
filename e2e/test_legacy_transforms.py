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


# The Edit > Transform family driven as the interactive session: Scale, Rotate, Skew, Distort, Perspective, Warp, the
# numeric form, Transform Again and a copy, and the layer flips. A 40 x 20 red layer with a blue 10 x 10 block in its
# top-left corner sits in the middle of a 200 x 200 white picture; the session is driven through the engine's own
# handle entry points (and a real pointer drag for the box handle), committed, and the flattened pixels, bounds and the
# undo step are read back.
SETUP = """() => {
  const e = window.formvis.engine;
  e.newDocument(200, 200, 'F', 'white');
  const c = document.createElement('canvas'); c.width = 40; c.height = 20;
  const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 40, 20); g.fillStyle = '#0000ff'; g.fillRect(0, 0, 10, 10);
  e.insertImages([{ name: 'r.png', width: 40, height: 20, source: c }]);
}"""
BOX = "() => { const t = window.formvis.engine.activeLayer.transform; return [t.x, t.y, t.w, t.h, t.rotation]; }"
BB = """() => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4;
    if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  return [x0, y0, x1, y1]; }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
RUN = "([id, p]) => window.formvis.commands.run(id, p)"
LAYERS = "() => window.formvis.engine.current.doc.layers.length"
UNDO = "() => window.formvis.engine.undo()"
BLUE = [0, 0, 255, 255]
RED = [255, 0, 0, 255]
WHITE = [255, 255, 255, 255]


def near(a, b, t=40):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def start(page):
    page.evaluate(SETUP)
    page.wait_for_timeout(300)


def bbox_close(a, b, t=2):
    return all(abs(x - y) <= t for x, y in zip(a, b))


DISTORT = """([mode, handle, dx, dy]) => {
  const e = window.formvis.engine;
  const ok = e.beginDistortMode(mode);
  const from = e.distortEdit.corners.map((c) => ({ x: c.x, y: c.y }));
  e.moveDistortHandle(handle, from, dx, dy);
  return { ok, corners: e.distortEdit.corners.map((c) => [Math.round(c.x), Math.round(c.y)]), mode: e.distortEdit.mode };
}"""


@steady
def test_scale_handle_drag_commits_a_bigger_layer_and_undo_restores_it(page):
    start(page)
    page.evaluate(RUN, ["transform-scale", None])
    assert page.evaluate("() => [window.formvis.engine.transformConstraint, window.formvis.engine.transformPending]") == ["scale", True]
    page.evaluate("""() => { const e = window.formvis.engine, t = e.activeLayer.transform;
      e.continueTransform({ kind: 'resize', handle: 4 }, { x: t.x + t.w, y: t.y + t.h });
      e.updateTransform({ x: t.x + t.w + 40, y: t.y + t.h + 20 }, false, false); e.applyPendingTransform(); }""")
    assert page.evaluate(BOX)[2:4] == [80, 40]
    assert bbox_close(page.evaluate(BB), [80, 90, 159, 129])
    assert near(page.evaluate(PX, [85, 95]), BLUE) and near(page.evaluate(PX, [140, 120]), RED)
    page.evaluate(UNDO)
    assert page.evaluate(BOX)[2:4] == [40, 20]


@steady
def test_scale_by_a_real_pointer_drag_and_enter(page):
    start(page)
    page.evaluate(RUN, ["transform-scale", None])
    at = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
    x0, y0 = page.evaluate(at, [120, 110])
    x1, y1 = page.evaluate(at, [140, 130])
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=8); page.mouse.up()
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    w, h = page.evaluate(BOX)[2:4]
    assert w > 50 and h > 30, (w, h)
    assert page.evaluate("() => window.formvis.engine.transformPending") is False


@steady
def test_escape_cancels_a_pending_scale_and_changes_nothing(page):
    start(page)
    page.evaluate(RUN, ["transform-scale", None])
    page.evaluate("""() => { const e = window.formvis.engine, t = e.activeLayer.transform;
      e.continueTransform({ kind: 'resize', handle: 4 }, { x: t.x + t.w, y: t.y + t.h }); e.updateTransform({ x: t.x + t.w + 60, y: t.y + t.h + 60 }, false, false); e.cancelPendingTransform(); }""")
    assert page.evaluate(BOX) == [80, 90, 40, 20, 0]
    assert bbox_close(page.evaluate(BB), [80, 90, 119, 109])


@steady
def test_rotate_a_quarter_turn_swaps_the_bounds_and_moves_the_blue_corner(page):
    start(page)
    page.evaluate(RUN, ["transform-rotate", None])
    assert page.evaluate("() => window.formvis.engine.transformConstraint") == "rotate"
    page.evaluate("""() => { const e = window.formvis.engine;
      e.continueTransform({ kind: 'rotate' }, { x: 160, y: 100 }); e.updateTransform({ x: 100, y: 160 }, false, false); e.applyPendingTransform(); }""")
    bb = page.evaluate(BB)
    assert bbox_close(bb, [90, 80, 109, 119], 3), bb
    assert near(page.evaluate(PX, [105, 84]), BLUE) and near(page.evaluate(PX, [95, 84]), RED)
    page.evaluate(UNDO)
    assert bbox_close(page.evaluate(BB), [80, 90, 119, 109])


@steady
def test_skew_moves_the_top_edge_sideways_and_keeps_the_bottom_edge(page):
    start(page)
    got = page.evaluate(DISTORT, ["skew", 4, 20, 0])
    assert got["ok"] and got["mode"] == "skew"
    page.evaluate("() => window.formvis.engine.applyDistort()")
    page.wait_for_timeout(200)
    assert bbox_close(page.evaluate(BB), [80, 90, 139, 109], 3)
    assert near(page.evaluate(PX, [128, 92]), RED) and near(page.evaluate(PX, [82, 92]), WHITE)
    assert near(page.evaluate(PX, [82, 107]), RED)


@steady
def test_distort_moves_one_corner_and_the_bounds_follow(page):
    start(page)
    got = page.evaluate(DISTORT, ["distort", 2, 30, 30])
    assert got["corners"][2] == [150, 140] and got["corners"][0] == [80, 90]
    page.evaluate("() => window.formvis.engine.applyDistort()")
    page.wait_for_timeout(200)
    bb = page.evaluate(BB)
    assert bbox_close(bb, [80, 90, 149, 139], 3), bb
    assert near(page.evaluate(PX, [84, 94]), BLUE) and near(page.evaluate(PX, [140, 130]), WHITE) is False


@steady
def test_perspective_squeezes_the_far_edge(page):
    start(page)
    got = page.evaluate(DISTORT, ["perspective", 0, 10, 0])
    c = got["corners"]
    assert c[0][0] == 90 and c[1][0] == 110, c
    page.evaluate("() => window.formvis.engine.applyDistort()")
    page.wait_for_timeout(200)
    assert near(page.evaluate(PX, [82, 92]), WHITE) and near(page.evaluate(PX, [117, 92]), WHITE)
    assert near(page.evaluate(PX, [82, 107]), RED) and near(page.evaluate(PX, [117, 107]), RED)


@steady
def test_distort_that_folds_the_layer_over_is_refused(page):
    start(page)
    got = page.evaluate(DISTORT, ["distort", 0, 200, 200])
    assert got["corners"][0] == [80, 90]
    page.evaluate("() => window.formvis.engine.cancelDistort()")
    assert page.evaluate("() => window.formvis.engine.distortEdit") is None
    assert page.evaluate(BOX) == [80, 90, 40, 20, 0]


@steady
def test_cancelled_distort_leaves_the_pixels_alone(page):
    start(page)
    page.evaluate(DISTORT, ["distort", 2, 30, 30])
    page.evaluate("() => window.formvis.engine.cancelDistort()")
    assert bbox_close(page.evaluate(BB), [80, 90, 119, 109])


@steady
def test_warp_command_with_a_style_commits_a_curved_layer_and_undo_restores_it(page):
    start(page)
    page.evaluate(RUN, ["transform-warp", {"style": "arc", "bend": 60}])
    assert page.evaluate("() => !!window.formvis.engine.meshWarpEdit") is True
    page.evaluate("() => window.formvis.engine.applyMeshWarp()")
    page.wait_for_timeout(300)
    assert page.evaluate("() => window.formvis.engine.meshWarpEdit") is None
    bb = page.evaluate(BB)
    assert bb[3] - bb[1] > 22, bb
    page.evaluate(UNDO)
    assert bbox_close(page.evaluate(BB), [80, 90, 119, 109])


@steady
def test_warp_point_drag_moves_inner_pixels_and_cancel_restores(page):
    start(page)
    page.evaluate(RUN, ["transform-warp", {"grid": 4}])
    n = page.evaluate("""() => { const e = window.formvis.engine, w = e.meshWarpEdit; e.moveMeshWarpPoint(5, { x: w.points[5][0] + 8, y: w.points[5][1] + 8 }); return w.points.length; }""")
    assert n == 16
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")
    assert page.evaluate("() => window.formvis.engine.meshWarpEdit") is None
    assert bbox_close(page.evaluate(BB), [80, 90, 119, 109])
    page.evaluate(RUN, ["transform-warp", {"grid": 3}])
    assert page.evaluate("() => window.formvis.engine.meshWarpEdit.points.length") == 9
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")


@steady
def test_numeric_transform_scales_and_rotates(page):
    start(page)
    page.evaluate(RUN, ["transform-numeric", {"scaleX": 200, "scaleY": 100}])
    page.wait_for_timeout(300)
    assert bbox_close(page.evaluate(BB), [60, 90, 139, 109], 3)
    page.evaluate(UNDO)
    page.evaluate(RUN, ["transform-numeric", {"angle": 90}])
    page.wait_for_timeout(300)
    bb = page.evaluate(BB)
    assert bbox_close(bb, [90, 80, 109, 119], 3), bb


@steady
def test_numeric_transform_moves_the_layer(page):
    start(page)
    page.evaluate(RUN, ["transform-numeric", {"moveX": 30, "moveY": -20}])
    page.wait_for_timeout(300)
    assert bbox_close(page.evaluate(BB), [110, 70, 149, 89], 3)


@steady
def test_transform_again_repeats_the_last_transform(page):
    start(page)
    page.evaluate(RUN, ["transform-numeric", {"moveX": 30}])
    page.wait_for_timeout(200)
    assert page.evaluate("() => window.formvis.engine.canTransformAgain") is True
    page.evaluate(RUN, ["transform-again", None])
    page.wait_for_timeout(300)
    bb = page.evaluate(BB)
    assert bb[0] >= 135, bb


@steady
def test_transform_again_on_a_copy_adds_a_layer(page):
    start(page)
    page.evaluate(RUN, ["transform-numeric", {"moveX": 30}])
    page.wait_for_timeout(200)
    before = page.evaluate(LAYERS)
    page.evaluate(RUN, ["transform-again-copy", None])
    page.wait_for_timeout(300)
    assert page.evaluate(LAYERS) == before + 1


@steady
def test_free_transform_a_copy_keeps_the_original_and_goes_pending(page):
    start(page)
    before = page.evaluate(LAYERS)
    page.evaluate(RUN, ["transform-copy", None])
    assert page.evaluate(LAYERS) == before + 1
    assert page.evaluate("() => window.formvis.engine.transformPending") is True
    page.evaluate("""() => { const e = window.formvis.engine, t = e.activeLayer.transform;
      e.continueTransform({ kind: 'move' }, { x: 100, y: 100 }); e.updateTransform({ x: 140, y: 100 }, false, false); e.applyPendingTransform(); }""")
    page.wait_for_timeout(200)
    assert near(page.evaluate(PX, [85, 95]), BLUE)
    assert near(page.evaluate(PX, [125, 95]), BLUE)


@steady
def test_flip_layer_horizontal_and_vertical_move_the_blue_corner(page):
    start(page)
    page.evaluate(RUN, ["flip-layer-h", None])
    page.wait_for_timeout(200)
    assert near(page.evaluate(PX, [114, 94]), BLUE) and near(page.evaluate(PX, [84, 94]), RED)
    page.evaluate(RUN, ["flip-layer-v", None])
    page.wait_for_timeout(200)
    assert near(page.evaluate(PX, [114, 104]), BLUE) and near(page.evaluate(PX, [114, 94]), RED)


@steady
def test_transform_again_is_off_in_a_fresh_document_and_on_after_a_transform(page):
    page.evaluate("() => window.formvis.engine.newDocument(50, 50, 'E', 'white')")
    assert page.evaluate("() => !!window.formvis.commands.get('transform-again').enabled()") is False
    assert page.evaluate("() => !!window.formvis.commands.get('transform-again-copy').enabled()") is False
    start(page)
    page.evaluate(RUN, ["transform-numeric", {"moveX": 10}])
    page.wait_for_timeout(200)
    assert page.evaluate("() => !!window.formvis.commands.get('transform-again').enabled()") is True
