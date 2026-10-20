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


# Layer rotate and flip, arbitrary canvas rotation, alpha channels and saved selections: each one runs as the command or
# the engine call behind it and the flattened picture, the layer state or the channel list is read back.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SIZE = "() => { const c = window.formvis.engine.flattened(); return [c.width, c.height]; }"
RUN = "(id) => window.formvis.commands.run(id)"
NEW = "([w, h]) => { window.formvis.engine.newDocument(w, h, 'F', 'white'); }"
BLOCK = """async ([x, y, w, h, r, g, b]) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.fg = { r, g, b };
  e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
}"""
SELECT = """async ([x, y, w, h]) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's');
}"""
ALPHAS = "() => (window.formvis.engine.current.doc.alphas ?? []).map((a) => a.name)"
RED = [255, 0, 0, 255]
WHITE = [255, 255, 255, 255]


def near(a, b, t=3):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def red_layer(page, size=(40, 20)):
    page.evaluate(NEW, list(size))
    page.evaluate("() => window.formvis.engine.addLayer()")
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])


@steady
def test_layer_rotate_90_cw_turns_the_layer_about_its_centre(page):
    red_layer(page, (20, 20))
    page.evaluate(RUN, "layer-rotate-90-cw")
    assert near(page.evaluate(PX, [15, 5]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)
    assert page.evaluate(SIZE) == [20, 20]


@steady
def test_layer_rotate_90_ccw_turns_the_other_way(page):
    red_layer(page, (20, 20))
    page.evaluate(RUN, "layer-rotate-90-ccw")
    assert near(page.evaluate(PX, [5, 15]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_four_layer_quarter_turns_restore_the_picture(page):
    red_layer(page, (20, 20))
    for _ in range(4):
        page.evaluate(RUN, "layer-rotate-90-cw")
    assert near(page.evaluate(PX, [5, 5]), RED) and near(page.evaluate(PX, [15, 5]), WHITE)


@steady
def test_flip_layer_vertical_moves_the_block_down(page):
    red_layer(page)
    page.evaluate(RUN, "flip-layer-v")
    assert near(page.evaluate(PX, [5, 15]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)
    page.evaluate(RUN, "undo")
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_rotate_90_ccw_swaps_the_size_and_puts_the_corner_at_the_bottom_left(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])
    page.evaluate(RUN, "rotate-90-ccw")
    assert page.evaluate(SIZE) == [20, 40]
    assert near(page.evaluate(PX, [5, 35]), RED) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_rotate_arbitrary_by_ninety_equals_the_quarter_turn(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])
    assert page.evaluate("() => window.formvis.engine.rotateCanvasBy(90)") is True
    assert page.evaluate(SIZE) == [20, 40] and near(page.evaluate(PX, [15, 5]), RED)


@steady
def test_rotate_arbitrary_by_forty_five_grows_the_canvas_to_hold_it(page):
    page.evaluate(NEW, [40, 20])
    assert page.evaluate("() => window.formvis.engine.rotateCanvasBy(45)") is True
    w, h = page.evaluate(SIZE)
    assert w == h == 43 and (w, h) != (40, 20)
    assert page.evaluate("() => window.formvis.engine.rotateCanvasBy(0)") is False
    page.evaluate(RUN, "undo")
    assert page.evaluate(SIZE) == [40, 20]


@steady
def test_new_channel_is_black_or_white_and_named(page):
    page.evaluate(NEW, [30, 20])
    assert page.evaluate(RUN, "new-channel") is True
    assert page.evaluate("(a) => window.formvis.commands.run('new-channel', a)", {"fill": "white", "name": "Mine"}) is True
    names = page.evaluate(ALPHAS)
    assert len(names) == 2 and names[1] == "Mine"
    page.evaluate("(c) => window.formvis.engine.loadSelection({ channel: c })", page.evaluate("() => window.formvis.engine.current.doc.alphas[1].id"))
    page.evaluate("() => { window.formvis.engine.fg = { r: 0, g: 0, b: 255 }; }")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [15, 10]), [0, 0, 255, 255])


@steady
def test_saved_selection_comes_back_after_deselect(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(SELECT, [0, 0, 10, 10])
    ch = page.evaluate("() => window.formvis.engine.saveSelection({ name: 'Keep' })")
    assert ch and page.evaluate(ALPHAS) == ["Keep"]
    page.evaluate("() => window.formvis.engine.deselect()")
    page.evaluate("(c) => window.formvis.engine.loadSelection({ channel: c })", ch)
    page.evaluate("() => { window.formvis.engine.fg = { r: 0, g: 0, b: 255 }; }")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255]) and near(page.evaluate(PX, [30, 10]), WHITE)


@steady
def test_load_selection_inverted_selects_the_outside(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(SELECT, [0, 0, 10, 10])
    ch = page.evaluate("() => window.formvis.engine.saveSelection({ name: 'Keep' })")
    page.evaluate("() => window.formvis.engine.deselect()")
    page.evaluate("(c) => window.formvis.engine.loadSelection({ channel: c }, true)", ch)
    page.evaluate("() => { window.formvis.engine.fg = { r: 0, g: 200, b: 0 }; }")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [30, 10]), [0, 200, 0, 255]) and near(page.evaluate(PX, [5, 5]), WHITE)


@steady
def test_duplicate_channel_copies_the_mask_under_a_new_name(page):
    page.evaluate(NEW, [40, 20])
    page.evaluate(SELECT, [0, 0, 10, 10])
    page.evaluate("() => window.formvis.engine.saveSelection({ name: 'Keep' })")
    assert page.evaluate("() => window.formvis.commands.run('duplicate-channel', { name: 'Twin' })") is True
    assert page.evaluate(ALPHAS) == ["Keep", "Twin"]
    twin = page.evaluate("() => window.formvis.engine.current.doc.alphas[1].id")
    page.evaluate("() => window.formvis.engine.deselect()")
    page.evaluate("(c) => window.formvis.engine.loadSelection({ channel: c })", twin)
    page.evaluate("() => { window.formvis.engine.fg = { r: 0, g: 0, b: 255 }; }")
    page.evaluate(RUN, "fill-fg")
    assert near(page.evaluate(PX, [5, 5]), [0, 0, 255, 255]) and near(page.evaluate(PX, [20, 10]), WHITE)


@steady
def test_split_channels_opens_one_grey_document_per_channel(page):
    page.evaluate(NEW, [30, 20])
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])
    before = page.evaluate("() => window.formvis.engine.projects.length")
    page.evaluate(RUN, "split-channels")
    assert page.evaluate("() => window.formvis.engine.projects.length") - before >= 3
    r = page.evaluate("() => { const e = window.formvis.engine; return Array.from(e.flattened().getContext('2d').getImageData(0, 0, 1, 1).data); }")
    assert r[0] == r[1] == r[2]


@steady
def test_merge_channels_rebuilds_a_colour_picture_from_three_greys(page):
    page.evaluate(NEW, [30, 20])
    page.evaluate(BLOCK, [0, 0, 10, 10, 255, 0, 0])
    page.evaluate(RUN, "split-channels")
    docs = page.evaluate("() => window.formvis.engine.alphaDocuments().map((d) => d.name)")
    pick = [next(d for d in docs if d.endswith(k)) for k in ("Red", "Green", "Blue")]
    before = page.evaluate("() => window.formvis.engine.projects.length")
    ok = page.evaluate("""(names) => window.formvis.commands.run('merge-channels', { red: names[0], green: names[1], blue: names[2] })""", pick)
    assert ok is True and page.evaluate("() => window.formvis.engine.projects.length") == before + 1
    assert near(page.evaluate(PX, [5, 5]), RED) and near(page.evaluate(PX, [20, 10]), WHITE)
