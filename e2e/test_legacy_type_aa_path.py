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


# Type > Anti-Alias (the seven type-aa-* modes) and the type-on-path family: Type on Arc, Type on Circle, Type on Path
# along the work path, Flip and Release Type on Path, Create Work Path. Each runs as the command; the layer's text spec
# and the drawn pixels are read back.
CALL = "async ([id, p]) => await window.formvis.commands.call(id, p)"
MODES = ["none", "sharp", "crisp", "strong", "smooth", "windows-lcd", "windows"]
TEXT = """async () => {
  const e = window.formvis.engine;
  e.newDocument(240, 100, 'F', 'white');
  await e.createTextLayer({ x: 10, y: 70 }, { ...e.textSettings, content: 'Asgw', size: 64, color: { r: 0, g: 0, b: 0 }, box: null, direction: 'horizontal' });
}"""
GREY = """() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 240, 100).data; let mid = 0, ink = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] < 250) ink++; if (d[i] > 20 && d[i] < 235) mid++; } return [mid, ink]; }"""
SPEC = "() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.text); return l && { aa: l.text.antialias ?? null, onPath: !!l.text.onPath, flip: !!(l.text.onPath && l.text.onPath.flip), offset: l.text.onPath ? l.text.onPath.offset : null, content: l.text.content }; }"
INK_BOX = """() => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { if (d[(y * c.width + x) * 4] < 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  return [x0, y0, x1, y1]; }"""
LINE_PATH = """() => { const e = window.formvis.engine; e.newDocument(300, 120, 'F', 'white');
  const pt = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y });
  e.setWorkPath({ subpaths: [{ closed: false, anchors: [pt(20, 90), pt(280, 90)] }] }); }"""


def settle(page, ms=700):
    page.wait_for_timeout(ms)


@steady
def test_each_anti_alias_command_sets_the_mode_on_the_type_layer(page):
    page.evaluate(TEXT)
    settle(page)
    for how in MODES:
        page.evaluate(CALL, [f"type-aa-{how}", None])
        settle(page, 500)
        assert page.evaluate(SPEC)["aa"] == how, how
        assert page.evaluate("(id) => window.formvis.commands.get(id).checked()", f"type-aa-{how}") is True


@steady
def test_only_the_active_anti_alias_mode_is_checked(page):
    page.evaluate(TEXT)
    settle(page)
    page.evaluate(CALL, ["type-aa-crisp", None])
    settle(page, 500)
    flags = page.evaluate("(m) => m.map((h) => !!window.formvis.commands.get('type-aa-' + h).checked())", MODES)
    assert flags == [h == "crisp" for h in MODES]


@steady
def test_none_draws_hard_edges_and_smooth_draws_grey_edges(page):
    page.evaluate(TEXT)
    settle(page)
    page.evaluate(CALL, ["type-aa-none", None])
    settle(page, 800)
    hard_mid, hard_ink = page.evaluate(GREY)
    page.evaluate(CALL, ["type-aa-smooth", None])
    settle(page, 800)
    soft_mid, soft_ink = page.evaluate(GREY)
    assert hard_ink > 500 and soft_ink > 500
    assert soft_mid > hard_mid * 3 + 20, (hard_mid, soft_mid)


@steady
def test_anti_alias_mode_changes_with_undo(page):
    page.evaluate(TEXT)
    settle(page)
    page.evaluate(CALL, ["type-aa-none", None])
    settle(page, 600)
    page.evaluate("() => window.formvis.engine.undo()")
    settle(page, 600)
    assert page.evaluate(SPEC)["aa"] != "none"


@steady
def test_type_on_circle_command_sets_a_ring_of_ink_around_the_centre(page):
    page.evaluate("() => window.formvis.engine.newDocument(240, 240, 'F', 'white')")
    page.evaluate(CALL, ["type-on-circle", {"text": "ROUND AND ROUND", "radius": 80}])
    settle(page, 1200)
    spec = page.evaluate(SPEC)
    assert spec and spec["onPath"] is True and spec["content"].startswith("ROUND")
    x0, y0, x1, y1 = page.evaluate(INK_BOX)
    assert 0 <= x0 < 70 and 170 < x1 <= 239 and 0 <= y0 < 70 and 170 < y1 <= 239, (x0, y0, x1, y1)
    cx = page.evaluate("() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(110, 110, 20, 20).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; }")
    assert cx == 0


@steady
def test_type_on_arc_sweep_limits_the_ink_to_the_upper_half(page):
    page.evaluate("() => window.formvis.engine.newDocument(240, 240, 'F', 'white')")
    page.evaluate(CALL, ["type-on-arc", {"text": "ARCH", "radius": 80, "sweep": 120}])
    settle(page, 1200)
    assert page.evaluate(SPEC)["onPath"] is True
    x0, y0, x1, y1 = page.evaluate(INK_BOX)
    assert y1 < 120 and x1 - x0 > 20, (x0, y0, x1, y1)


@steady
def test_flip_type_on_path_toggles_the_flip_and_moves_the_ink_to_the_other_side(page):
    page.evaluate("() => window.formvis.engine.newDocument(240, 240, 'F', 'white')")
    page.evaluate(CALL, ["type-on-arc", {"text": "ARCH", "radius": 80, "sweep": 120}])
    settle(page, 1200)
    before = page.evaluate(INK_BOX)
    page.evaluate(CALL, ["type-path-flip", None])
    settle(page, 1200)
    assert page.evaluate(SPEC)["flip"] is True
    after = page.evaluate(INK_BOX)
    assert after != before
    page.evaluate(CALL, ["type-path-flip", None])
    settle(page, 1200)
    assert page.evaluate(SPEC)["flip"] is False


@steady
def test_release_type_from_path_makes_straight_text(page):
    page.evaluate("() => window.formvis.engine.newDocument(240, 240, 'F', 'white')")
    page.evaluate(CALL, ["type-on-circle", {"text": "ROUND", "radius": 80}])
    settle(page, 1200)
    page.evaluate(CALL, ["type-path-release", None])
    settle(page, 1200)
    spec = page.evaluate(SPEC)
    assert spec["onPath"] is False and spec["content"] == "ROUND"
    x0, y0, x1, y1 = page.evaluate(INK_BOX)
    assert y1 - y0 < 100


@steady
def test_path_commands_are_off_for_a_plain_type_layer(page):
    page.evaluate(TEXT)
    settle(page)
    states = page.evaluate("() => ['type-path-flip', 'type-path-release', 'type-on-path'].map((id) => !!window.formvis.commands.get(id).enabled())")
    assert states == [False, False, False]


@steady
def test_type_on_path_follows_the_work_path_and_the_start_offset(page):
    page.evaluate(LINE_PATH)
    assert page.evaluate("() => !!window.formvis.commands.get('type-on-path').enabled()") is True
    page.evaluate("async () => { await window.formvis.engine.createTextOnPath('HELLO', 0); }")
    settle(page, 1200)
    spec = page.evaluate(SPEC)
    assert spec["onPath"] is True and spec["offset"] == 0
    x0, y0, x1, y1 = page.evaluate(INK_BOX)
    assert x0 < 60 and y1 <= 100 and y0 >= 40, (x0, y0, x1, y1)
    page.evaluate(LINE_PATH)
    page.evaluate("async () => { await window.formvis.engine.createTextOnPath('HELLO', 60); }")
    settle(page, 1200)
    assert page.evaluate(INK_BOX)[0] > x0 + 100


@steady
def test_type_on_path_command_opens_its_dialog_and_ok_sets_the_text(page):
    page.evaluate(LINE_PATH)
    page.evaluate("() => window.formvis.commands.run('type-on-path')")
    page.wait_for_selector("input[placeholder='Text to set on the path']", timeout=10000)
    page.fill("input[placeholder='Text to set on the path']", "DIALOG")
    page.get_by_role("button", name="OK").last.click()
    settle(page, 1500)
    spec = page.evaluate(SPEC)
    assert spec and spec["onPath"] is True and spec["content"] == "DIALOG"


@steady
def test_empty_text_on_a_circle_adds_no_layer(page):
    page.evaluate("() => window.formvis.engine.newDocument(240, 240, 'F', 'white')")
    n = page.evaluate("() => window.formvis.engine.current.doc.layers.length")
    page.evaluate(CALL, ["type-on-circle", {"text": "   ", "radius": 60}])
    settle(page, 600)
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.length") == n


@steady
def test_create_work_path_from_type_makes_a_work_path(page):
    page.evaluate(TEXT)
    settle(page)
    assert page.evaluate("() => window.formvis.engine.workPath") is None
    page.evaluate(CALL, ["type-work-path", None])
    settle(page, 800)
    wp = page.evaluate("() => { const w = window.formvis.engine.workPath; return w && w.subpaths.length; }")
    assert wp and wp >= 4
