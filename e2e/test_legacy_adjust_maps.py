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


# Auto tone, auto colour, auto contrast, replace colour, normal and bump maps, apply image, pixel aspect ratio commands,
# colour samplers and count groups. Each one runs as the command (with parameters where it takes them) and the
# flattened picture, the layer pixels or the document state is read back.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
RUN = "([id, p]) => window.formvis.commands.run(id, p)"
CALL = "async ([id, p]) => { const r = await window.formvis.commands.call(id, p); return r; }"
NEW = "([w, h]) => { window.formvis.engine.newDocument(w, h, 'F', 'white'); }"
BLOCK = """async ([x, y, w, h, r, g, b]) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.fg = { r, g, b };
  e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
}"""
DOC = "(k) => window.formvis.engine.current.doc[k] ?? null"


def near(a, b, t=4):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def settle(page):
    page.wait_for_timeout(300)


def two_tone(page, left, right, size=(40, 20)):
    page.evaluate(NEW, list(size))
    page.evaluate(BLOCK, [0, 0, size[0] // 2, size[1], *left])
    page.evaluate(BLOCK, [size[0] // 2, 0, size[0] // 2, size[1], *right])


@steady
def test_auto_contrast_stretches_a_flat_range_to_black_and_white(page):
    two_tone(page, (100, 100, 100), (150, 150, 150))
    page.evaluate(RUN, ["auto-contrast", None])
    settle(page)
    left, right = page.evaluate(PX, [5, 5]), page.evaluate(PX, [35, 5])
    assert left[0] < 40 and right[0] > 215 and left[0] == left[1] == left[2]


@steady
def test_auto_tone_widens_each_channel_range(page):
    two_tone(page, (90, 100, 110), (150, 160, 170))
    page.evaluate(RUN, ["auto-tone", None])
    settle(page)
    left, right = page.evaluate(PX, [5, 5]), page.evaluate(PX, [35, 5])
    assert max(left[:3]) < 60 and min(right[:3]) > 190


@steady
def test_auto_color_neutralises_a_colour_cast(page):
    two_tone(page, (90, 60, 40), (210, 180, 150))
    page.evaluate(RUN, ["auto-color", None])
    settle(page)
    mid = [page.evaluate(PX, [5, 5]), page.evaluate(PX, [35, 5])]
    spread_before = 90 - 40
    for p in mid:
        assert max(p[:3]) - min(p[:3]) < spread_before


@steady
def test_auto_tone_is_one_undo_step(page):
    two_tone(page, (100, 100, 100), (150, 150, 150))
    page.evaluate(RUN, ["auto-tone", None])
    settle(page)
    page.evaluate(RUN, ["undo", None])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), [100, 100, 100, 255], 2)


REPLACE = """() => window.formvis.engine.replaceColor({ plus: [{ r: 255, g: 0, b: 0 }], minus: [], fuzziness: 40, hue: 120, saturation: 0, lightness: 0 })"""


@steady
def test_replace_color_turns_red_to_green_and_leaves_white(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 20, 20, 255, 0, 0])
    page.evaluate(REPLACE)
    settle(page)
    r, g, b, _ = page.evaluate(PX, [5, 5])
    assert g > r + 100 and g > b + 100
    assert near(page.evaluate(PX, [35, 5]), [255, 255, 255, 255])


@steady
def test_normal_map_of_a_flat_picture_points_straight_out(page):
    page.evaluate(NEW, [24, 24])
    page.evaluate(BLOCK, [0, 0, 24, 24, 120, 120, 120])
    page.evaluate(RUN, ["normal-map", {"strength": 2, "blur": 0}])
    settle(page)
    r, g, b, _ = page.evaluate(PX, [12, 12])
    assert abs(r - 128) <= 3 and abs(g - 128) <= 3 and b > 250


@steady
def test_normal_map_tilts_across_a_step_edge(page):
    two_tone(page, (0, 0, 0), (255, 255, 255), (24, 24))
    page.evaluate(RUN, ["normal-map", {"strength": 5, "blur": 0}])
    settle(page)
    at_edge = page.evaluate(PX, [12, 12])
    flat = page.evaluate(PX, [3, 12])
    assert abs(at_edge[0] - 128) > 40 and abs(flat[0] - 128) <= 3


@steady
def test_normal_map_flip_y_inverts_the_green_channel(page):
    def edge(flip):
        page.evaluate(NEW, [24, 24])
        page.evaluate(BLOCK, [0, 0, 24, 12, 0, 0, 0])
        page.evaluate(BLOCK, [0, 12, 24, 12, 255, 255, 255])
        page.evaluate(RUN, ["normal-map", {"strength": 5, "blur": 0, "flip_y": flip}])
        settle(page)
        return page.evaluate(PX, [12, 12])[1]
    a, b = edge(False), edge(True)
    assert abs(a - 128) > 40 and abs((a - 128) + (b - 128)) <= 6


@steady
def test_bump_map_is_grey_and_keeps_the_light_dark_order(page):
    two_tone(page, (40, 40, 40), (200, 200, 200))
    page.evaluate(RUN, ["bump-map", {"strength": 2, "blur": 0}])
    settle(page)
    left, right = page.evaluate(PX, [3, 5]), page.evaluate(PX, [37, 5])
    assert left[0] == left[1] == left[2] and right[0] == right[1] == right[2]
    assert right[0] > left[0] + 60


@steady
def test_bump_map_invert_reverses_light_and_dark(page):
    two_tone(page, (40, 40, 40), (200, 200, 200))
    page.evaluate(RUN, ["bump-map", {"strength": 2, "blur": 0, "invert": True}])
    settle(page)
    assert page.evaluate(PX, [3, 5])[0] > page.evaluate(PX, [37, 5])[0] + 60


TWO_LAYERS = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(30, 20, 'F', 'white');
  const fill = (r, g, b) => { e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(0, 0, 30, 20, new Uint8Array(600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer(); fill(200, 40, 10);
  const below = e.current.activeId;
  e.addLayer(); fill(0, 0, 255);
  return below;
}"""


@steady
def test_apply_image_copies_another_layer_into_the_active_one(page):
    below = page.evaluate(TWO_LAYERS)
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])
    page.evaluate(RUN, ["apply-image", {"layer": below, "mode": "normal"}])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), [200, 40, 10, 255])


@steady
def test_apply_image_single_channel_makes_grey(page):
    below = page.evaluate(TWO_LAYERS)
    page.evaluate(RUN, ["apply-image", {"layer": below, "channel": "red"}])
    settle(page)
    r, g, b, _ = page.evaluate(PX, [5, 5])
    assert near([r, g, b], [200, 200, 200], 6)


@steady
def test_apply_image_invert_flips_the_source(page):
    below = page.evaluate(TWO_LAYERS)
    page.evaluate(RUN, ["apply-image", {"layer": below, "invert": True}])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), [55, 215, 245, 255], 6)


@steady
def test_apply_image_half_opacity_blends_both(page):
    below = page.evaluate(TWO_LAYERS)
    page.evaluate(RUN, ["apply-image", {"layer": below, "opacity": 50}])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), [100, 20, 132, 255], 8)


@steady
def test_apply_image_subtract_with_offset(page):
    below = page.evaluate(TWO_LAYERS)
    page.evaluate(RUN, ["apply-image", {"layer": below, "mode": "subtract", "scale": 1, "offset": 0}])
    settle(page)
    r, g, b, _ = page.evaluate(PX, [5, 5])
    assert r == 0 and g == 0 and b > 200


@steady
def test_pixel_aspect_presets_set_the_ratio_and_square_clears_it(page):
    page.evaluate(NEW, [20, 20])
    page.evaluate(RUN, ["par-anamorphic", None])
    assert page.evaluate(DOC, "pixelAspect") == 2
    page.evaluate(RUN, ["par-d1-pal", None])
    assert abs(page.evaluate(DOC, "pixelAspect") - 1.09) < 0.001
    page.evaluate(RUN, ["par-square", None])
    assert page.evaluate(DOC, "pixelAspect") is None


@steady
def test_pixel_aspect_custom_takes_a_ratio_and_rejects_out_of_range(page):
    page.evaluate(NEW, [20, 20])
    page.evaluate(CALL, ["par-custom", {"ratio": 1.25}])
    assert page.evaluate(DOC, "pixelAspect") == 1.25
    page.evaluate(CALL, ["par-custom", {"ratio": 50}])
    assert page.evaluate(DOC, "pixelAspect") == 1.25


@steady
def test_pixel_aspect_change_is_undoable(page):
    page.evaluate(NEW, [20, 20])
    page.evaluate(RUN, ["par-hdv", None])
    assert page.evaluate(DOC, "pixelAspect") == 1.33
    page.evaluate(RUN, ["undo", None])
    assert page.evaluate(DOC, "pixelAspect") is None


@steady
def test_pixel_aspect_correction_toggles_the_view(page):
    before = page.evaluate("() => !!window.formvis.engine.view.parCorrection")
    page.evaluate(RUN, ["par-correction", None])
    assert page.evaluate("() => !!window.formvis.engine.view.parCorrection") is (not before)
    page.evaluate(RUN, ["par-correction", None])
    assert page.evaluate("() => !!window.formvis.engine.view.parCorrection") is before


SAMPLERS = "() => window.formvis.engine.measure.samplers.map((s) => [s.x, s.y])"


@steady
def test_sampler_add_move_delete_and_clear(page):
    page.evaluate(NEW, [40, 20])
    r = page.evaluate(CALL, ["sampler-add", {"x": 5, "y": 6}])
    assert r["result"] == {"index": 1}
    page.evaluate(CALL, ["sampler-add", {"x": 20, "y": 10}])
    assert page.evaluate(SAMPLERS) == [[5.5, 6.5], [20.5, 10.5]]
    page.evaluate(CALL, ["sampler-move", {"index": 1, "x": 30, "y": 15}])
    assert page.evaluate(SAMPLERS)[0] == [30.5, 15.5]
    page.evaluate(CALL, ["sampler-delete", {"index": 1}])
    assert page.evaluate(SAMPLERS) == [[20.5, 10.5]]
    page.evaluate(RUN, ["sampler-clear", None])
    assert page.evaluate(SAMPLERS) == []


@steady
def test_sampler_positions_clamp_to_the_picture(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(CALL, ["sampler-add", {"x": 500, "y": -9}])
    assert page.evaluate(SAMPLERS) == [[39.5, 0.5]]
    page.evaluate(RUN, ["sampler-clear", None])


@steady
def test_sampler_add_stops_at_ten(page):
    page.evaluate(NEW, [40, 20])
    for i in range(12):
        page.evaluate(CALL, ["sampler-add", {"x": i, "y": 1}])
    assert len(page.evaluate(SAMPLERS)) == 10
    page.evaluate(RUN, ["sampler-clear", None])


@steady
def test_sampler_move_with_unknown_index_changes_nothing(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(CALL, ["sampler-add", {"x": 5, "y": 5}])
    r = page.evaluate(CALL, ["sampler-move", {"index": 9, "x": 1, "y": 1}])
    assert r["result"] == {"changed": False} and page.evaluate(SAMPLERS) == [[5.5, 5.5]]
    page.evaluate(RUN, ["sampler-clear", None])


GROUPS = "() => (window.formvis.engine.current.doc.countGroups ?? []).map((g) => ({ name: g.name, color: g.color, hidden: !!g.hidden }))"


@steady
def test_count_groups_are_created_renamed_hidden_and_deleted(page):
    page.evaluate(NEW, [40, 20])
    r = page.evaluate(CALL, ["count-new-group", {"name": "Birds", "color": "#112233"}])
    assert r["result"]["group"]
    assert page.evaluate(GROUPS) == [{"name": "Group 1", "color": "#ff5a36", "hidden": False}, {"name": "Birds", "color": "#112233", "hidden": False}]
    page.evaluate(CALL, ["count-new-group", {"name": "Cars"}])
    assert [g["name"] for g in page.evaluate(GROUPS)] == ["Group 1", "Birds", "Cars"]
    page.evaluate(CALL, ["count-set-group", {"group": "Cars", "name": "Vans", "hidden": True}])
    cars = page.evaluate(GROUPS)[2]
    assert cars["name"] == "Vans" and cars["hidden"] is True
    page.evaluate(CALL, ["count-set-group", {"group": "Vans", "delete": True}])
    assert [g["name"] for g in page.evaluate(GROUPS)] == ["Group 1", "Birds"]


@steady
def test_count_set_group_unknown_name_reports_no_change(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(CALL, ["count-new-group", {"name": "A"}])
    r = page.evaluate(CALL, ["count-set-group", {"group": "Nope", "name": "B"}])
    assert r["result"] == {"changed": False} and [g["name"] for g in page.evaluate(GROUPS)] == ["Group 1", "A"]
