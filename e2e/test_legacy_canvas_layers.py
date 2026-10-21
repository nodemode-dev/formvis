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


# Legacy editing commands that had no test: canvas rotate and flip, desaturate, fill with foreground or background,
# select-all and inverse, layer arrange, hide, merge, masks and colour labels. Each one is run as the command and the
# flattened picture or the layer list is read back.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SIZE = "() => { const c = window.formvis.engine.flattened(); return [c.width, c.height]; }"
RUN = "(id) => window.formvis.commands.run(id)"

BLOCK = """async ([x, y, w, h, r, g, b]) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.fg = { r, g, b };
  e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's');
  e.fill('fg'); e.deselect();
}"""
NEW = "([w, h]) => { const e = window.formvis.engine; e.newDocument(w, h, 'F', 'white'); }"
RED = [255, 0, 0, 255]
WHITE = [255, 255, 255, 255]


def near(a, b, t=2):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def red_block(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])


@steady
def test_rotate_90_cw_swaps_the_size_and_moves_the_corner(page):
    red_block(page)
    page.evaluate(RUN, "rotate-90-cw")
    assert page.evaluate(SIZE) == [20, 40]
    assert near(page.evaluate(PX, [15, 5]), RED) and near(page.evaluate(PX, [2, 5]), WHITE)


@steady
def test_rotate_180_moves_the_corner_to_the_opposite_one(page):
    red_block(page)
    page.evaluate(RUN, "rotate-180")
    assert page.evaluate(SIZE) == [40, 20]
    assert near(page.evaluate(PX, [35, 15]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_flip_canvas_vertical_moves_the_block_down(page):
    red_block(page)
    page.evaluate(RUN, "flip-canvas-v")
    assert near(page.evaluate(PX, [5, 15]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_flip_canvas_twice_restores_the_picture(page):
    red_block(page)
    page.evaluate(RUN, "flip-canvas-v"); page.evaluate(RUN, "flip-canvas-v")
    assert near(page.evaluate(PX, [5, 5]), RED) and near(page.evaluate(PX, [5, 15]), WHITE)


@steady
def test_desaturate_removes_the_colour(page):
    red_block(page)
    page.evaluate(RUN, "desaturate")
    r, g, b, a = page.evaluate(PX, [5, 5])
    assert r == g == b and 0 < r < 255 and a == 255


@steady
def test_fill_fg_and_fill_bg_use_their_colours(page):
    page.evaluate(NEW, [30, 20])
    page.evaluate("() => { const e = window.formvis.engine; e.fg = { r: 10, g: 20, b: 200 }; e.bg = { r: 200, g: 100, b: 0 }; }")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [3, 3]), [10, 20, 200, 255])
    page.evaluate(RUN, "fill-bg")
    assert near(page.evaluate(PX, [3, 3]), [200, 100, 0, 255])


@steady
def test_inverse_selection_fills_only_the_outside(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.fg = { r: 0, g: 0, b: 255 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); }""")
    page.evaluate(RUN, "inverse")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [30, 10]), [0, 0, 255, 255]) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_select_all_then_fill_covers_the_whole_picture(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate("() => { window.formvis.engine.fg = { r: 0, g: 160, b: 0 }; }")
    page.evaluate(RUN, "select-all")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [0, 0]), [0, 160, 0, 255]) and near(page.evaluate(PX, [39, 19]), [0, 160, 0, 255])


TWO = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(40, 20, 'F', 'white');
  const rect = (r, g, b) => { e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(0, 0, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer(); rect(255, 0, 0);
  e.addLayer(); rect(0, 0, 255);
}"""
TOP = "() => { const p = window.formvis.engine.current; return p.doc.layers.map((l) => l.id).indexOf(p.activeId) }"


@steady
def test_send_back_and_bring_front_change_what_is_on_top(page):
    page.evaluate(TWO)
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])
    page.evaluate(RUN, "send-back")
    assert not near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])
    page.evaluate(RUN, "bring-front")
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])


@steady
def test_hide_layers_shows_what_is_below(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "hide-layers")
    assert near(page.evaluate(PX, [5, 5]), RED)
    page.evaluate(RUN, "hide-layers")
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])


@steady
def test_show_only_layer_hides_the_others(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "show-only-layer")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.filter((l) => l.visible).length") == 1
    page.evaluate(RUN, "show-all-layers")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.every((l) => l.visible)")


@steady
def test_merge_visible_leaves_one_layer_with_the_same_picture(page):
    page.evaluate(TWO)
    before = page.evaluate(PX, [5, 5])
    page.evaluate(RUN, "merge-visible")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.length") == 1
    assert page.evaluate(PX, [5, 5]) == before


@steady
def test_hide_all_mask_hides_the_layer_and_delete_mask_brings_it_back(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "add-mask-hide")
    assert page.evaluate("() => !!window.formvis.engine.activeLayer.mask")
    assert near(page.evaluate(PX, [5, 5]), RED)
    page.evaluate(RUN, "delete-mask")
    assert page.evaluate("() => !!window.formvis.engine.activeLayer.mask") is False
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255])


@steady
def test_layer_colour_label_is_set_and_cleared(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "layer-label-red")
    assert page.evaluate("() => window.formvis.engine.activeLayer.label") == "red"
    page.evaluate(RUN, "layer-label-none")
    assert page.evaluate("() => window.formvis.engine.activeLayer.label ?? null") is None


@steady
def test_flip_layer_horizontal_mirrors_the_layer_pixels(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate("() => window.formvis.engine.addLayer()")
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])
    page.evaluate(RUN, "flip-layer-h")
    assert near(page.evaluate(PX, [35, 5]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_undo_reverts_a_canvas_rotation(page):
    red_block(page)
    page.evaluate(RUN, "rotate-90-cw")
    page.evaluate(RUN, "undo")
    assert page.evaluate(SIZE) == [40, 20] and near(page.evaluate(PX, [5, 5]), RED)
