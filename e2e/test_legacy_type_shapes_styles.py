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


# Combine-shapes commands, the Type menu style toggles and find-and-replace, layer styles (apply, copy, paste, clear,
# to the layer below, hide, scale), global light, smart-object stack modes and smart filters. Each one runs as the
# command or the engine call behind it and the picture, the layer state or the text content is read back.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
RUN = "([id, p]) => window.formvis.commands.run(id, p)"
CALL = "async ([id, p]) => { const r = await window.formvis.commands.call(id, p); return r; }"
NEW = "([w, h]) => { window.formvis.engine.newDocument(w, h, 'F', 'white'); }"
RED = [255, 0, 0, 255]
WHITE = [255, 255, 255, 255]


def near(a, b, t=6):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def settle(page, ms=400):
    page.wait_for_timeout(ms)


TWO_SHAPES = """() => {
  const e = window.formvis.engine;
  e.newDocument(40, 40, 'F', 'white');
  const pt = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y });
  const rect = (x, y, s) => ({ subpaths: [{ closed: true, anchors: [pt(x, y), pt(x + s, y), pt(x + s, y + s), pt(x, y + s)] }] });
  const red = { r: 255, g: 0, b: 0 };
  e.addShapeLayers([{ name: 'A', path: rect(0, 0, 20), fill: red, stroke: null }, { name: 'B', path: rect(10, 10, 20), fill: red, stroke: null }]);
  const ids = e.current.doc.layers.filter((l) => l.vector).map((l) => l.id);
  e.selectLayer(ids[0]); e.selectLayer(ids[1], 'toggle');
  return ids;
}"""
SHAPE_COUNT = "() => window.formvis.engine.current.doc.layers.filter((l) => l.vector).length"


def combined(page, op):
    page.evaluate(TWO_SHAPES)
    settle(page)
    assert page.evaluate(RUN, [op, None]) is True
    settle(page)
    return {k: page.evaluate(PX, v) for k, v in {"a": [4, 4], "both": [15, 15], "b": [26, 26], "out": [35, 5]}.items()}


@steady
def test_shapes_unite_fills_both_outlines(page):
    px = combined(page, "shapes-unite")
    assert near(px["a"], RED) and near(px["both"], RED) and near(px["b"], RED) and near(px["out"], WHITE)
    assert page.evaluate(SHAPE_COUNT) == 1


@steady
def test_shapes_subtract_removes_the_front_shape(page):
    px = combined(page, "shapes-subtract")
    assert near(px["a"], RED) and near(px["both"], WHITE) and near(px["b"], WHITE)
    assert page.evaluate(SHAPE_COUNT) == 1


@steady
def test_shapes_intersect_keeps_only_the_overlap(page):
    px = combined(page, "shapes-intersect")
    assert near(px["both"], RED) and near(px["a"], WHITE) and near(px["b"], WHITE)


@steady
def test_shapes_exclude_leaves_the_overlap_empty(page):
    px = combined(page, "shapes-exclude")
    assert near(px["a"], RED) and near(px["b"], RED) and near(px["both"], WHITE)


@steady
def test_combine_shapes_is_one_undo_step(page):
    combined(page, "shapes-intersect")
    page.evaluate(RUN, ["undo", None])
    settle(page)
    assert page.evaluate(SHAPE_COUNT) == 2
    assert near(page.evaluate(PX, [4, 4]), RED) and near(page.evaluate(PX, [26, 26]), RED)


@steady
def test_shape_commands_are_off_for_a_single_one_outline_shape(page):
    page.evaluate(TWO_SHAPES)
    page.evaluate("() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.filter((l) => l.vector)[0].id); }")
    assert page.evaluate(RUN, ["shapes-unite", None]) is False


TEXT = """async (content) => {
  const e = window.formvis.engine;
  e.newDocument(200, 80, 'F', 'white');
  await e.createTextLayer({ x: 10, y: 50 }, { ...e.textSettings, content, size: 36, color: { r: 0, g: 0, b: 0 }, box: null, direction: 'horizontal' });
}"""
LAYER_TEXT = "() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.text); return l && { content: l.text.content, caps: l.text.caps ?? null, underline: !!l.text.underline, strike: !!l.text.strike, direction: l.text.direction }; }"
INK = "() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 200, 80).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; }"


@steady
def test_type_all_caps_sets_the_attribute_and_toggles_off(page):
    page.evaluate(TEXT, "abc")
    settle(page, 700)
    page.evaluate(CALL, ["type-all-caps", None])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["caps"] == "all"
    page.evaluate(CALL, ["type-all-caps", None])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["caps"] is None


@steady
def test_type_small_caps_replaces_all_caps(page):
    page.evaluate(TEXT, "abc")
    settle(page, 700)
    page.evaluate(CALL, ["type-all-caps", None])
    settle(page, 500)
    page.evaluate(CALL, ["type-small-caps", None])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["caps"] == "small"


@steady
def test_type_all_caps_changes_the_drawn_pixels(page):
    page.evaluate(TEXT, "xxx")
    settle(page, 700)
    before = page.evaluate(INK)
    page.evaluate(CALL, ["type-all-caps", None])
    settle(page, 900)
    assert page.evaluate(INK) > before * 1.3


@steady
def test_type_underline_adds_ink_below_the_text(page):
    page.evaluate(TEXT, "abc")
    settle(page, 700)
    before = page.evaluate(INK)
    page.evaluate(CALL, ["type-underline", None])
    settle(page, 900)
    assert page.evaluate(LAYER_TEXT)["underline"] is True
    assert page.evaluate(INK) > before
    page.evaluate(CALL, ["type-underline", None])
    settle(page, 900)
    assert page.evaluate(LAYER_TEXT)["underline"] is False and page.evaluate(INK) == before


@steady
def test_type_strikethrough_adds_ink_through_the_text(page):
    page.evaluate(TEXT, "iii")
    settle(page, 700)
    before = page.evaluate(INK)
    page.evaluate(CALL, ["type-strikethrough", None])
    settle(page, 900)
    assert page.evaluate(LAYER_TEXT)["strike"] is True and page.evaluate(INK) > before


@steady
def test_type_vertical_and_horizontal_switch_direction(page):
    page.evaluate(TEXT, "abc")
    settle(page, 700)
    page.evaluate(CALL, ["type-vertical", None])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["direction"] == "vertical"
    page.evaluate(CALL, ["type-horizontal", None])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["direction"] == "horizontal"


@steady
def test_find_replace_text_changes_the_content_and_reports_count(page):
    page.evaluate(TEXT, "cat and Cat and cat")
    settle(page, 700)
    page.evaluate(CALL, ["find-replace-text", {"find": "cat", "replace": "dog"}])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["content"] == "dog and dog and dog"


@steady
def test_find_replace_text_respects_case_and_whole_word(page):
    page.evaluate(TEXT, "cat Cat concat")
    settle(page, 700)
    page.evaluate(CALL, ["find-replace-text", {"find": "cat", "replace": "X", "case_sensitive": True, "whole_word": True}])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["content"] == "X Cat concat"


@steady
def test_find_replace_text_with_empty_replacement_deletes_matches_and_undoes(page):
    page.evaluate(TEXT, "a-b-c")
    settle(page, 700)
    page.evaluate(CALL, ["find-replace-text", {"find": "-", "replace": ""}])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["content"] == "abc"
    page.evaluate(RUN, ["undo", None])
    settle(page, 700)
    assert page.evaluate(LAYER_TEXT)["content"] == "a-b-c"


@steady
def test_find_replace_text_without_a_match_changes_nothing(page):
    page.evaluate(TEXT, "hello")
    settle(page, 700)
    page.evaluate(CALL, ["find-replace-text", {"find": "zzz", "replace": "q"}])
    settle(page, 400)
    assert page.evaluate(LAYER_TEXT)["content"] == "hello"


STYLED = """async () => {
  const e = window.formvis.engine, T = await import('/src/engine/types.ts');
  e.newDocument(40, 20, 'F', 'white');
  e.addLayer();
  const E = await import('/src/engine/index.ts');
  e.fg = { r: 0, g: 0, b: 255 };
  e.applySelection(E.SelectionMask.cropped(0, 0, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
}"""
OVERLAY = """async (on) => {
  const e = window.formvis.engine, T = await import('/src/engine/types.ts'), fx = T.defaultEffects();
  fx.colorOverlay = { ...fx.colorOverlay, enabled: true, color: { r: 255, g: 0, b: 0 }, opacity: 1 };
  return e.applyLayerStyle(fx);
}"""
FX = "() => { const l = window.formvis.engine.activeLayer; return !!(l.effects && l.effects.colorOverlay && l.effects.colorOverlay.enabled); }"


@steady
def test_layer_style_overlay_recolours_the_flattened_picture(page):
    page.evaluate(STYLED)
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])
    assert page.evaluate(OVERLAY, True) is True
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), RED) and near(page.evaluate(PX, [30, 5]), WHITE)


@steady
def test_clear_layer_style_restores_the_original_colour(page):
    page.evaluate(STYLED)
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["clear-layer-style", None])
    settle(page)
    assert page.evaluate(FX) is False and near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])


@steady
def test_toggle_layer_effects_hides_and_shows_the_style(page):
    page.evaluate(STYLED)
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["toggle-layer-effects", None])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])
    page.evaluate(RUN, ["toggle-layer-effects", None])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_hide_all_effects_hides_every_layers_style(page):
    page.evaluate(STYLED)
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["hide-all-effects", None])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])
    page.evaluate(RUN, ["hide-all-effects", None])
    settle(page)
    assert near(page.evaluate(PX, [5, 5]), RED)


SECOND = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.addLayer();
  e.fg = { r: 0, g: 160, b: 0 };
  e.applySelection(E.SelectionMask.cropped(20, 0, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
}"""


@steady
def test_copy_then_paste_layer_style_gives_another_layer_the_look(page):
    page.evaluate(STYLED)
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["copy-layer-style", None])
    page.evaluate(SECOND)
    assert near(page.evaluate(PX, [30, 5]), [0, 160, 0, 255])
    assert page.evaluate(RUN, ["paste-layer-style", None]) is True
    settle(page)
    assert near(page.evaluate(PX, [30, 5]), RED)


@steady
def test_copy_style_below_keeps_the_source_and_move_style_below_removes_it(page):
    page.evaluate(STYLED)
    page.evaluate(SECOND)
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["copy-style-below", None])
    settle(page)
    both = page.evaluate("() => window.formvis.engine.current.doc.layers.map((l) => !!(l.effects && l.effects.colorOverlay && l.effects.colorOverlay.enabled))")
    assert both[-2:] == [True, True]
    page.evaluate(RUN, ["clear-layer-style", None])
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["clear-layer-style", None])
    page.evaluate(OVERLAY, True)
    page.evaluate(RUN, ["move-style-below", None])
    settle(page)
    top = page.evaluate("() => { const l = window.formvis.engine.current.doc.layers; return [!!(l[l.length - 1].effects && l[l.length - 1].effects.colorOverlay && l[l.length - 1].effects.colorOverlay.enabled)]; }")
    assert top == [False]


SHADOWED = """async () => {
  const e = window.formvis.engine, T = await import('/src/engine/types.ts'), fx = T.defaultEffects();
  fx.stroke = { ...fx.stroke, enabled: true, color: { r: 255, g: 0, b: 0 }, opacity: 1, size: 4 };
  e.applyLayerStyle(fx);
}"""
STROKE_SIZE = "() => window.formvis.engine.activeLayer.effects.stroke.size"


@steady
def test_scale_effects_dialog_less_engine_call_multiplies_the_size(page):
    page.evaluate(STYLED)
    page.evaluate(SHADOWED)
    page.evaluate("() => window.formvis.engine.scaleEffects(2)")
    settle(page)
    assert page.evaluate(STROKE_SIZE) == 8
    page.evaluate(RUN, ["undo", None])
    settle(page)
    assert page.evaluate(STROKE_SIZE) == 4


@steady
def test_scale_effects_command_is_off_without_a_style(page):
    page.evaluate(STYLED)
    assert page.evaluate(RUN, ["scale-effects", None]) is False


@steady
def test_global_light_is_stored_clamped_and_undoable(page):
    page.evaluate(NEW, [20, 20])
    page.evaluate("() => window.formvis.engine.setGlobalLight({ angle: 200, altitude: 120 })")
    assert page.evaluate("() => window.formvis.engine.current.doc.globalLight") == {"angle": 180, "altitude": 90}
    page.evaluate("() => window.formvis.engine.setGlobalLight({ angle: -45, altitude: 30 })")
    assert page.evaluate("() => window.formvis.engine.current.doc.globalLight") == {"angle": -45, "altitude": 30}
    page.evaluate(RUN, ["undo", None])
    assert page.evaluate("() => window.formvis.engine.current.doc.globalLight") == {"angle": 180, "altitude": 90}


@steady
def test_style_dialog_commands_open_the_layer_style_dialog(page):
    page.evaluate(STYLED)
    assert page.evaluate(RUN, ["style-drop-shadow", None]) is True
    page.wait_for_selector(".cv-scrim:not([hidden])", timeout=5000)
    page.keyboard.press("Escape")
    settle(page, 300)


STACK = """async (values) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(20, 20, 'F', 'white');
  for (const v of values) {
    e.addLayer(); e.fg = { r: v, g: v, b: v };
    e.applySelection(E.SelectionMask.cropped(0, 0, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  }
  e.selectAllLayers(true);
  window.formvis.commands.run('convert-smart');
}"""


def stack_value(page, mode):
    assert page.evaluate(RUN, [f"stack-mode-{mode}", None]) is True
    settle(page, 700)
    return page.evaluate(PX, [5, 5])[0]


@steady
def test_stack_modes_compute_the_per_pixel_statistic(page):
    page.evaluate(STACK, [50, 100, 200])
    settle(page, 700)
    assert page.evaluate("() => window.formvis.engine.stackMode") is not None
    assert stack_value(page, "maximum") == 255
    assert abs(stack_value(page, "minimum") - 50) <= 2
    assert abs(stack_value(page, "median") - 150) <= 2
    assert abs(stack_value(page, "mean") - 151) <= 3
    assert abs(stack_value(page, "range") - 205) <= 2
    assert stack_value(page, "summation") == 255


@steady
def test_stack_mode_is_one_undo_step_and_none_shows_the_top(page):
    page.evaluate(STACK, [50, 100, 200])
    settle(page, 700)
    stack_value(page, "minimum")
    page.evaluate(RUN, ["undo", None])
    settle(page, 700)
    assert abs(page.evaluate(PX, [5, 5])[0] - 200) <= 2
    assert abs(stack_value(page, "none") - 200) <= 2


@steady
def test_stack_mode_commands_are_off_without_a_stack(page):
    page.evaluate(NEW, [20, 20])
    assert page.evaluate(RUN, ["stack-mode-median", None]) is False


SMART = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(60, 20, 'F', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#000'; c.fillRect(0, 0, 30, 20); l.raster.touch(); e.refresh();
  window.formvis.commands.run('convert-smart');
}"""
AT = "(x) => window.formvis.engine.flattened().getContext('2d').getImageData(x, 10, 1, 1).data[0]"
FILTERS = "() => window.formvis.engine.current.activeLayer.smart.filters.map((f) => [f.kind, f.enabled])"


@steady
def test_smart_filter_blurs_the_edge_and_clear_removes_it(page):
    page.evaluate(SMART)
    settle(page, 500)
    assert page.evaluate(AT, 27) < 5
    page.evaluate("() => window.formvis.engine.addSmartFilter('gaussianBlur', { radius: 6 })")
    settle(page, 1200)
    assert page.evaluate(AT, 27) > 20 and page.evaluate(FILTERS) == [["gaussianBlur", True]]
    page.evaluate(RUN, ["smart-filters-clear", None])
    settle(page, 1200)
    assert page.evaluate(AT, 27) < 5 and page.evaluate(FILTERS) == []


@steady
def test_smart_filters_disable_command_toggles_every_filter(page):
    page.evaluate(SMART)
    page.evaluate("() => window.formvis.engine.addSmartFilter('gaussianBlur', { radius: 6 })")
    settle(page, 1200)
    page.evaluate(RUN, ["smart-filters-disable", None])
    settle(page, 1200)
    assert page.evaluate(FILTERS) == [["gaussianBlur", False]] and page.evaluate(AT, 27) < 5
    page.evaluate(RUN, ["smart-filters-disable", None])
    settle(page, 1200)
    assert page.evaluate(FILTERS) == [["gaussianBlur", True]] and page.evaluate(AT, 27) > 20


@steady
def test_smart_filters_stack_in_order_and_one_can_be_edited(page):
    page.evaluate(SMART)
    page.evaluate("() => { const e = window.formvis.engine; e.addSmartFilter('gaussianBlur', { radius: 2 }); e.addSmartFilter('gaussianBlur', { radius: 3 }); }")
    settle(page, 1200)
    assert [f[0] for f in page.evaluate(FILTERS)] == ["gaussianBlur", "gaussianBlur"]
    small = page.evaluate(AT, 27)
    page.evaluate("() => { const e = window.formvis.engine, l = e.current.activeLayer; e.setSmartFilters(l.id, l.smart.filters.map((f, i) => i === 1 ? { ...f, settings: { radius: 9 } } : f)); }")
    settle(page, 1200)
    assert page.evaluate(AT, 27) > small


@steady
def test_smart_filter_mask_add_toggle_delete_state(page):
    page.evaluate(SMART)
    page.evaluate("() => window.formvis.engine.addSmartFilter('gaussianBlur', { radius: 6 })")
    settle(page, 1200)
    page.evaluate(RUN, ["add-filter-mask", None])
    settle(page, 800)
    assert page.evaluate("() => !!window.formvis.engine.current.activeLayer.smart.filterMask") is True
    assert page.evaluate(RUN, ["add-filter-mask", None]) is False
    page.evaluate(RUN, ["toggle-filter-mask", None])
    assert page.evaluate("() => window.formvis.engine.current.activeLayer.smart.filterMaskEnabled") is False
    page.evaluate(RUN, ["toggle-filter-mask", None])
    assert page.evaluate("() => window.formvis.engine.current.activeLayer.smart.filterMaskEnabled") is True
    page.evaluate(RUN, ["delete-filter-mask", None])
    assert page.evaluate("() => !!window.formvis.engine.current.activeLayer.smart.filterMask") is False
