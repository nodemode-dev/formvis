# Legacy layer commands that had no test: stamp visible, grouping, masks (reveal, hide, invert), layer rotate,
# reverse order, layer via cut and the auto adjustments. Each is run as the command and the flattened picture or the
# layer list is read back.
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


BLUE = [0, 0, 255, 255]
TWO = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(40, 20, 'F', 'white');
  const rect = (r, g, b) => { e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(0, 0, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer(); rect(255, 0, 0);
  e.addLayer(); rect(0, 0, 255);
}"""
COUNT = "() => window.formvis.engine.current.doc.layers.length"


@steady
def test_stamp_visible_adds_a_layer_holding_the_picture(page):
    page.evaluate(TWO)
    n = page.evaluate(COUNT)
    page.evaluate(RUN, "stamp-visible")
    assert page.evaluate(COUNT) == n + 1
    page.evaluate("() => window.formvis.engine.current.doc.layers.slice(0, -1).forEach((l) => window.formvis.engine.current.updateLayer(l.id, { visible: false }))")
    assert near(page.evaluate(PX, [5, 5]), BLUE)


@steady
def test_group_and_ungroup_change_the_layer_tree_not_the_picture(page):
    page.evaluate(TWO)
    n = page.evaluate(COUNT)
    page.evaluate(RUN, "group")
    assert page.evaluate(COUNT) == n + 1
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.some((l) => l.isGroup)")
    assert near(page.evaluate(PX, [5, 5]), BLUE)
    page.evaluate("() => { const p = window.formvis.engine.current; p.selectedIds = new Set(p.doc.layers.filter((l) => l.isGroup).map((l) => l.id)); }")
    page.evaluate(RUN, "ungroup")
    assert page.evaluate(COUNT) == n
    assert near(page.evaluate(PX, [5, 5]), BLUE)


@steady
def test_reveal_all_mask_changes_nothing_and_hide_all_hides(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "mask-reveal-all")
    assert page.evaluate("() => !!window.formvis.engine.activeLayer.mask") and near(page.evaluate(PX, [5, 5]), BLUE)
    page.evaluate(RUN, "delete-mask")
    page.evaluate(RUN, "mask-hide-all")
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_invert_mask_turns_a_hiding_mask_into_a_revealing_one(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "mask-hide-all")
    assert near(page.evaluate(PX, [5, 5]), RED)
    page.evaluate(RUN, "mask-invert")
    assert near(page.evaluate(PX, [5, 5]), BLUE)


@steady
def test_apply_mask_bakes_the_hidden_pixels_in(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "mask-hide-all")
    page.evaluate(RUN, "apply-mask")
    assert page.evaluate("() => !!window.formvis.engine.activeLayer.mask") is False
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_layer_rotate_180_turns_the_layer_pixels(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate("() => window.formvis.engine.addLayer()")
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])
    page.evaluate(RUN, "layer-rotate-180")
    assert near(page.evaluate(PX, [35, 15]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_reverse_layers_swaps_the_order_of_the_selected(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "select-all-layers")
    order = page.evaluate("() => window.formvis.engine.current.doc.layers.map((l) => l.id)")
    page.evaluate(RUN, "reverse-layers")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.map((l) => l.id)") == order[::-1]


@steady
def test_layer_via_cut_moves_the_selected_pixels_to_a_new_layer(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 40, 20, 255, 0, 0])
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.applySelection(E.SelectionMask.cropped(0, 0, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); }""")
    n = page.evaluate(COUNT)
    page.evaluate(RUN, "layer-via-cut")
    assert page.evaluate(COUNT) == n + 1
    assert near(page.evaluate(PX, [5, 5]), RED) and near(page.evaluate(PX, [30, 10]), RED)
    page.evaluate("() => { const p = window.formvis.engine.current; p.updateLayer(p.activeId, { visible: false }); }")
    assert not near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_auto_contrast_stretches_a_flat_grey_range(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 40, 20, 100, 100, 100])
    page.evaluate(BLOCK, [0, 0, 20, 20, 150, 150, 150])
    page.evaluate(RUN, "auto-contrast")
    dark, light = page.evaluate(PX, [30, 10])[0], page.evaluate(PX, [5, 5])[0]
    assert light - dark > 50


@steady
def test_equalize_spreads_two_tones_apart(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 40, 20, 100, 100, 100])
    page.evaluate(BLOCK, [0, 0, 20, 20, 130, 130, 130])
    page.evaluate(RUN, "equalize")
    dark, light = page.evaluate(PX, [30, 10])[0], page.evaluate(PX, [5, 5])[0]
    assert light - dark > 30
