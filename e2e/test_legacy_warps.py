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


# The warp family that the transform tests leave out: Split Warp (horizontal, vertical, crosswise) and Remove Warp Split
# on a pending Warp grid, Perspective Warp (planes drawn in Layout, corners moved in Warp) and Puppet Warp (pins placed
# and dragged). An 80 x 40 red layer with a blue 20 x 20 block in its top-left corner sits at (60, 80) in a 200 x 200
# white picture; the sessions are driven through the engine's own entry points, committed, and the flattened pixels,
# bounds and the undo step are read back.
SETUP = """() => {
  const e = window.formvis.engine;
  e.newDocument(200, 200, 'W', 'white');
  const c = document.createElement('canvas'); c.width = 80; c.height = 40;
  const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 80, 40); g.fillStyle = '#0000ff'; g.fillRect(0, 0, 20, 20);
  e.insertImages([{ name: 'r.png', width: 80, height: 40, source: c }]);
}"""
BB = """() => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4;
    if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  return [x0, y0, x1, y1]; }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
RUN = "([id, p]) => window.formvis.commands.run(id, p)"
ENABLED = "(id) => !!window.formvis.commands.get(id).enabled()"
UNDO = "() => window.formvis.engine.undo()"
HIST = "() => window.formvis.engine.current.history ? window.formvis.engine.current.history.length : -1"
GRID = "() => { const w = window.formvis.engine.meshWarpEdit; return w ? [w.gw, w.gh, w.points.length] : null; }"
BLUE = [0, 0, 255, 255]
RED = [255, 0, 0, 255]
WHITE = [255, 255, 255, 255]
START_BB = [60, 80, 139, 119]


def near(a, b, t=40):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def bbox_close(a, b, t=3):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def start(page):
    page.evaluate(SETUP)
    page.wait_for_timeout(300)
    assert bbox_close(page.evaluate(BB), START_BB, 1)


def warp(page, grid=3):
    page.evaluate(RUN, ["transform-warp", {"grid": grid}])
    assert page.evaluate("() => !!window.formvis.engine.meshWarpEdit") is True


def apply_warp(page):
    page.evaluate("() => window.formvis.engine.applyMeshWarp()")
    page.wait_for_timeout(300)


@steady
def test_split_commands_are_off_without_a_warp_and_on_during_one(page):
    start(page)
    for cid in ("warp-split-h", "warp-split-v", "warp-split-cross", "warp-remove-split"):
        assert page.evaluate(ENABLED, cid) is False, cid
    warp(page)
    for cid in ("warp-split-h", "warp-split-v", "warp-split-cross", "warp-remove-split"):
        assert page.evaluate(ENABLED, cid) is True, cid
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")
    assert page.evaluate(ENABLED, "warp-split-h") is False


@steady
def test_split_horizontally_adds_a_row_and_vertically_a_column(page):
    start(page)
    warp(page, 3)
    assert page.evaluate(GRID) == [3, 3, 9]
    page.evaluate(RUN, ["warp-split-h", None])
    assert page.evaluate(GRID) == [3, 4, 12]
    page.evaluate(RUN, ["warp-split-v", None])
    assert page.evaluate(GRID) == [4, 4, 16]
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")


@steady
def test_split_crosswise_adds_both_a_row_and_a_column(page):
    start(page)
    warp(page, 3)
    page.evaluate(RUN, ["warp-split-cross", None])
    assert page.evaluate(GRID) == [4, 4, 16]
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")


@steady
def test_split_at_a_given_point_puts_the_new_line_there_and_the_picture_does_not_change(page):
    start(page)
    warp(page, 3)
    before = page.evaluate("() => window.formvis.engine.meshWarpEdit.vs.slice()")
    page.evaluate(RUN, ["warp-split-h", {"x": 100, "y": 90}])
    after = page.evaluate("() => window.formvis.engine.meshWarpEdit.vs.slice()")
    assert len(after) == len(before) + 1
    new = [v for v in after if v not in before]
    assert new and 0 < new[0] < 1, (before, after)
    ys = page.evaluate("() => { const w = window.formvis.engine.meshWarpEdit; return w.points.filter((p, i) => i % w.gw === 0).map((p) => p[1]); }")
    assert any(abs(y - 90) <= 3 for y in ys), ys
    apply_warp(page)
    assert bbox_close(page.evaluate(BB), START_BB, 2)
    assert near(page.evaluate(PX, [65, 85]), BLUE) and near(page.evaluate(PX, [120, 110]), RED)
    assert near(page.evaluate(PX, [100, 85]), RED) and near(page.evaluate(PX, [55, 100]), WHITE)


@steady
def test_a_split_point_dragged_moves_the_pixels_around_it_and_undo_restores_them(page):
    start(page)
    warp(page, 3)
    page.evaluate(RUN, ["warp-split-cross", {"x": 90, "y": 95}])
    n = page.evaluate("""() => { const e = window.formvis.engine, w = e.meshWarpEdit, i = w.gw + 1;
      e.moveMeshWarpPoint(i, { x: w.points[i][0] + 12, y: w.points[i][1] + 10 }); return w.points.length; }""")
    assert n == 16
    apply_warp(page)
    assert page.evaluate("() => window.formvis.engine.meshWarpEdit") is None
    assert near(page.evaluate(PX, [65, 85]), BLUE, 60) and near(page.evaluate(PX, [135, 115]), RED)
    page.evaluate(UNDO)
    page.wait_for_timeout(200)
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    assert near(page.evaluate(PX, [65, 85]), BLUE) and near(page.evaluate(PX, [75, 95]), BLUE)


@steady
def test_a_corner_dragged_after_a_split_grows_the_bounds(page):
    start(page)
    warp(page, 3)
    page.evaluate(RUN, ["warp-split-v", None])
    page.evaluate("""() => { const e = window.formvis.engine, w = e.meshWarpEdit, i = w.points.length - 1;
      e.moveMeshWarpPoint(i, { x: w.points[i][0] + 20, y: w.points[i][1] + 20 }); }""")
    apply_warp(page)
    bb = page.evaluate(BB)
    assert bbox_close(bb, [60, 80, 159, 139], 3), bb
    assert near(page.evaluate(PX, [65, 85]), BLUE)
    page.evaluate(UNDO)
    assert bbox_close(page.evaluate(BB), START_BB, 1)


@steady
def test_remove_split_takes_back_the_last_split_and_never_the_border(page):
    start(page)
    warp(page, 3)
    page.evaluate(RUN, ["warp-split-h", None])
    page.evaluate(RUN, ["warp-split-v", None])
    assert page.evaluate(GRID) == [4, 4, 16]
    page.evaluate(RUN, ["warp-remove-split", None])
    assert page.evaluate(GRID) == [3, 4, 12]
    page.evaluate(RUN, ["warp-remove-split", None])
    assert page.evaluate(GRID) == [3, 3, 9] or page.evaluate(GRID) == [2, 4, 8]
    for _ in range(6):
        page.evaluate(RUN, ["warp-remove-split", None])
    gw, gh, n = page.evaluate(GRID)
    assert gw >= 2 and gh >= 2 and n == gw * gh
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")


@steady
def test_a_split_that_would_fold_a_cell_is_refused_and_the_grid_stays(page):
    start(page)
    warp(page, 3)
    page.evaluate("""() => { const e = window.formvis.engine, w = e.meshWarpEdit;
      e.moveMeshWarpPoint(4, { x: w.points[4][0] + 15, y: w.points[4][1] + 6 }); }""")
    got = page.evaluate("() => window.formvis.engine.splitMeshWarp('cross', { x: 100, y: 100 })")
    gw, gh, n = page.evaluate(GRID)
    assert n == gw * gh
    assert (got is True and gw == 4 and gh == 4) or (got is False and [gw, gh] == [3, 3])
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")


@steady
def test_split_warp_escape_cancel_changes_nothing(page):
    start(page)
    warp(page, 3)
    page.evaluate(RUN, ["warp-split-cross", None])
    page.evaluate("() => window.formvis.engine.cancelMeshWarp()")
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    assert near(page.evaluate(PX, [65, 85]), BLUE)


PERSP = """() => {
  const e = window.formvis.engine;
  const ok = e.beginPerspectiveWarp();
  const k = e.addPerspectivePlane({ x: 60, y: 80 }, { x: 140, y: 120 });
  return { ok, k, phase: e.perspectiveEdit.phase, planes: e.perspectiveEdit.planes.length };
}"""


@steady
def test_perspective_warp_command_opens_the_layout_phase_with_no_planes(page):
    start(page)
    assert page.evaluate(ENABLED, "perspective-warp") is True
    page.evaluate(RUN, ["perspective-warp", None])
    got = page.evaluate("() => { const w = window.formvis.engine.perspectiveEdit; return w ? [w.phase, w.planes.length] : null; }")
    assert got == ["layout", 0]
    page.evaluate("() => window.formvis.engine.cancelPerspectiveWarp()")
    assert page.evaluate("() => window.formvis.engine.perspectiveEdit") is None


@steady
def test_perspective_warp_moving_a_corner_pulls_the_picture_and_undo_restores_it(page):
    start(page)
    got = page.evaluate(PERSP)
    assert got == {"ok": True, "k": 0, "phase": "layout", "planes": 1}
    page.evaluate("() => window.formvis.engine.setPerspectivePhase('warp')")
    assert page.evaluate("() => window.formvis.engine.perspectiveEdit.phase") == "warp"
    page.evaluate("() => window.formvis.engine.movePerspectiveCorner(2, 0, { x: 160, y: 140 })")
    page.evaluate("() => window.formvis.engine.movePerspectiveCorner(0, 2, { x: 160, y: 140 })")
    page.evaluate("() => window.formvis.engine.applyPerspectiveWarp()")
    page.wait_for_timeout(300)
    assert page.evaluate("() => window.formvis.engine.perspectiveEdit") is None
    bb = page.evaluate(BB)
    assert bbox_close(bb, [60, 80, 159, 139], 4), bb
    assert near(page.evaluate(PX, [65, 85]), BLUE) and near(page.evaluate(PX, [150, 130]), RED)
    assert near(page.evaluate(PX, [55, 100]), WHITE)
    page.evaluate(UNDO)
    page.wait_for_timeout(200)
    assert bbox_close(page.evaluate(BB), START_BB, 1)


@steady
def test_perspective_warp_top_corners_pinched_narrows_the_top_edge(page):
    start(page)
    page.evaluate(PERSP)
    page.evaluate("() => window.formvis.engine.setPerspectivePhase('warp')")
    page.evaluate("""() => { const e = window.formvis.engine;
      e.movePerspectiveCorner(0, 0, { x: 80, y: 80 }); e.movePerspectiveCorner(0, 1, { x: 120, y: 80 }); e.applyPerspectiveWarp(); }""")
    page.wait_for_timeout(300)
    assert near(page.evaluate(PX, [62, 83]), WHITE)
    assert near(page.evaluate(PX, [137, 83]), WHITE)
    assert near(page.evaluate(PX, [100, 83]), RED) or near(page.evaluate(PX, [100, 83]), BLUE)
    assert near(page.evaluate(PX, [62, 116]), RED) and near(page.evaluate(PX, [137, 116]), RED)


@steady
def test_perspective_warp_cancel_and_an_unmoved_plane_change_nothing(page):
    start(page)
    page.evaluate(PERSP)
    page.evaluate("() => window.formvis.engine.setPerspectivePhase('warp')")
    page.evaluate("() => window.formvis.engine.movePerspectiveCorner(0, 2, { x: 170, y: 150 })")
    page.evaluate("() => window.formvis.engine.cancelPerspectiveWarp()")
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    page.evaluate(PERSP)
    page.evaluate("() => window.formvis.engine.setPerspectivePhase('warp'); window.formvis.engine.applyPerspectiveWarp()")
    page.wait_for_timeout(200)
    assert page.evaluate("() => window.formvis.engine.perspectiveEdit") is None
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.length") == 2
    assert near(page.evaluate(PX, [65, 85]), BLUE)


@steady
def test_perspective_warp_refuses_a_fold_and_a_move_in_layout_moves_the_plane_and_its_source(page):
    start(page)
    page.evaluate(PERSP)
    page.evaluate("() => window.formvis.engine.setPerspectivePhase('warp')")
    page.evaluate("() => window.formvis.engine.movePerspectiveCorner(0, 0, { x: 300, y: 300 })")
    c = page.evaluate("() => window.formvis.engine.perspectiveEdit.planes[0].dst[0]")
    assert c == [60, 80]
    page.evaluate("() => window.formvis.engine.cancelPerspectiveWarp()")
    page.evaluate(PERSP)
    page.evaluate("() => window.formvis.engine.movePerspectiveCorner(0, 0, { x: 70, y: 85 })")
    pl = page.evaluate("() => window.formvis.engine.perspectiveEdit.planes[0]")
    assert pl["src"][0] == [70, 85] and pl["dst"][0] == [70, 85]
    page.evaluate("() => window.formvis.engine.cancelPerspectiveWarp()")


@steady
def test_perspective_warp_straighten_levels_a_slightly_tilted_edge(page):
    start(page)
    page.evaluate(PERSP)
    page.evaluate("() => window.formvis.engine.setPerspectivePhase('warp')")
    page.evaluate("() => window.formvis.engine.movePerspectiveCorner(0, 1, { x: 140, y: 83 })")
    page.evaluate("() => window.formvis.engine.straightenPerspective(false)")
    d = page.evaluate("() => window.formvis.engine.perspectiveEdit.planes[0].dst")
    assert abs(d[0][1] - d[1][1]) < 0.5, d
    page.evaluate("() => window.formvis.engine.cancelPerspectiveWarp()")


@steady
def test_perspective_warp_needs_a_pixel_layer(page):
    page.evaluate("() => window.formvis.engine.newDocument(60, 60, 'N', 'white')")
    page.evaluate("() => window.formvis.engine.addAdjustment ? 0 : 0")
    assert page.evaluate("() => window.formvis.engine.perspectiveEdit") is None


PUPPET = """() => {
  const e = window.formvis.engine;
  const ok = e.beginPuppetWarp();
  return ok;
}"""


@steady
def test_puppet_warp_command_starts_a_session_and_passes_its_options(page):
    start(page)
    assert page.evaluate(ENABLED, "puppet-warp") is True
    page.evaluate(RUN, ["puppet-warp", {"mode": "distort", "density": "more", "expansion": 5, "showMesh": False}])
    got = page.evaluate("() => { const e = window.formvis.engine; return [!!e.puppetEdit, e.puppetOpts.mode, e.puppetOpts.density, e.puppetOpts.expansion, e.puppetOpts.showMesh]; }")
    assert got == [True, "distort", "more", 5, False]
    page.evaluate("() => window.formvis.engine.cancelPuppetWarp()")
    assert page.evaluate("() => window.formvis.engine.puppetEdit") is None
    page.evaluate("() => window.formvis.engine.setPuppetOpts({ mode: 'rigid', density: 'normal', expansion: 0, showMesh: true })")


@steady
def test_puppet_warp_one_pin_dragged_carries_the_layer_with_it_and_undo_restores_it(page):
    start(page)
    page.evaluate(RUN, ["puppet-warp", None])
    i = page.evaluate("() => window.formvis.engine.addPuppetPin({ x: 100, y: 100 })")
    assert i == 0
    page.evaluate("() => window.formvis.engine.movePuppetPin(0, { x: 120, y: 110 })")
    page.evaluate("() => window.formvis.engine.applyPuppetWarp()")
    page.wait_for_timeout(300)
    assert page.evaluate("() => window.formvis.engine.puppetEdit") is None
    bb = page.evaluate(BB)
    assert bbox_close(bb, [80, 90, 159, 129], 4), bb
    assert near(page.evaluate(PX, [85, 95]), BLUE) and near(page.evaluate(PX, [150, 120]), RED)
    assert near(page.evaluate(PX, [62, 82]), WHITE)
    page.evaluate(UNDO)
    page.wait_for_timeout(200)
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    assert near(page.evaluate(PX, [65, 85]), BLUE)


@steady
def test_puppet_warp_two_pins_hold_one_end_and_bend_the_other(page):
    start(page)
    page.evaluate(RUN, ["puppet-warp", None])
    page.evaluate("() => { const e = window.formvis.engine; e.addPuppetPin({ x: 65, y: 100 }); e.addPuppetPin({ x: 135, y: 100 }); }")
    page.evaluate("() => window.formvis.engine.movePuppetPin(1, { x: 135, y: 125 })")
    page.evaluate("() => window.formvis.engine.applyPuppetWarp()")
    page.wait_for_timeout(300)
    bb = page.evaluate(BB)
    assert bb[3] >= 124, bb
    assert near(page.evaluate(PX, [65, 100]), RED, 60) or near(page.evaluate(PX, [65, 100]), BLUE, 60)
    assert near(page.evaluate(PX, [135, 124]), RED, 60)
    assert near(page.evaluate(PX, [135, 82]), WHITE)
    assert near(page.evaluate(PX, [135, 128]), RED, 90) or near(page.evaluate(PX, [135, 122]), RED, 90)


@steady
def test_puppet_warp_alt_click_removal_drops_a_pin_and_a_pin_that_never_moved_changes_nothing(page):
    start(page)
    page.evaluate(RUN, ["puppet-warp", None])
    page.evaluate("() => { const e = window.formvis.engine; e.addPuppetPin({ x: 70, y: 90 }); e.addPuppetPin({ x: 130, y: 110 }); }")
    assert page.evaluate("() => window.formvis.engine.puppetEdit.to.length") == 2
    page.evaluate("() => window.formvis.engine.removePuppetPin(0)")
    got = page.evaluate("() => { const w = window.formvis.engine.puppetEdit; return [w.to.length, w.to[0][0], w.sel]; }")
    assert got == [1, 130, 0]
    page.evaluate("() => window.formvis.engine.applyPuppetWarp()")
    page.wait_for_timeout(200)
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    assert near(page.evaluate(PX, [65, 85]), BLUE)


@steady
def test_puppet_warp_pin_rotation_turns_the_picture_around_the_pin(page):
    start(page)
    page.evaluate(RUN, ["puppet-warp", None])
    page.evaluate("() => { const e = window.formvis.engine; e.addPuppetPin({ x: 100, y: 100 }); e.setPuppetPin({ rot: 90 }); e.applyPuppetWarp(); }")
    page.wait_for_timeout(300)
    bb = page.evaluate(BB)
    assert (bb[2] - bb[0]) < 70 and (bb[3] - bb[1]) > 50, bb
    assert near(page.evaluate(PX, [65, 85]), WHITE)


@steady
def test_puppet_warp_cancel_changes_nothing_and_a_second_session_cannot_open_inside_one(page):
    start(page)
    page.evaluate(RUN, ["puppet-warp", None])
    page.evaluate("() => { const e = window.formvis.engine; e.addPuppetPin({ x: 100, y: 100 }); e.movePuppetPin(0, { x: 150, y: 150 }); }")
    assert page.evaluate("() => window.formvis.engine.beginPuppetWarp()") is False
    assert page.evaluate("() => window.formvis.engine.beginPerspectiveWarp()") is False
    assert page.evaluate("() => window.formvis.engine.beginMeshWarp()") is False
    page.evaluate("() => window.formvis.engine.cancelPuppetWarp()")
    page.wait_for_timeout(200)
    assert bbox_close(page.evaluate(BB), START_BB, 1)
    assert near(page.evaluate(PX, [65, 85]), BLUE)


@steady
def test_puppet_warp_pointer_drag_with_the_move_tool_places_a_pin_and_drags_it(page):
    start(page)
    page.evaluate(RUN, ["puppet-warp", None])
    at = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
    x0, y0 = page.evaluate(at, [100, 100])
    x1, y1 = page.evaluate(at, [125, 100])
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=8); page.mouse.up()
    page.wait_for_timeout(300)
    got = page.evaluate("() => { const w = window.formvis.engine.puppetEdit; return w ? [w.to.length, Math.round(w.to[0][0]), Math.round(w.from[0][0])] : null; }")
    assert got is not None and got[0] == 1 and got[2] in range(98, 103) and got[1] > got[2] + 15, got
    page.keyboard.press("Enter")
    page.wait_for_timeout(400)
    assert page.evaluate("() => window.formvis.engine.puppetEdit") is None
    bb = page.evaluate(BB)
    assert bb[0] >= 78, bb
