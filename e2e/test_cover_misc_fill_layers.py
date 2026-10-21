# Layer > New Fill Layer: Solid Color, Gradient and Pattern dialogs, their pixels, OK and Cancel, and Layer Content Options.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
COUNT = "window.formvis.engine.current.doc.layers.length"
FILL = "JSON.parse(JSON.stringify(window.formvis.engine.current.activeLayer.fillContent))"


def begin(page, cmd):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'F', 'white'); window.formvis.engine.fg = { r: 255, g: 0, b: 0 }; window.formvis.engine.bg = { r: 0, g: 0, b: 255 }")
    page.evaluate(f"window.formvis.commands.run('{cmd}')")
    page.get_by_role("button", name="OK").last.wait_for(timeout=5000)


def set_visible(page, label, value):
    page.wait_for_function("""([label]) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop();
      return !!d && [...d.querySelectorAll('.cv-field')].some((f) => f.offsetParent && (f.querySelector('span') || {}).textContent.trim() === label); }""", arg=[label], timeout=5000)
    page.evaluate("""([label]) => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop();
      const f = [...d.querySelectorAll('.cv-field')].find((x) => x.offsetParent && (x.querySelector('span') || {}).textContent.trim() === label);
      const i = f.querySelector('input'); i.focus(); i.select(); }""", [label])
    page.keyboard.type(value)
    page.keyboard.press("Tab")


def test_solid_color_fill_layer_paints_the_whole_canvas_and_ok_keeps_it(page):
    begin(page, "new-fill-solid")
    assert page.evaluate(PX, [100, 50]) == [255, 0, 0] and page.evaluate(PX, [0, 0]) == [255, 0, 0]
    page.get_by_role("button", name="OK").last.click()
    assert page.evaluate(COUNT) == 2 and page.evaluate(FILL)["kind"] == "solid"
    assert page.evaluate(PX, [199, 99]) == [255, 0, 0]


def test_cancel_takes_a_new_fill_layer_back(page):
    begin(page, "new-fill-solid")
    assert page.evaluate(COUNT) == 2
    page.get_by_role("button", name="Cancel").last.click()
    assert page.evaluate(COUNT) == 1 and page.evaluate(PX, [100, 50]) == [255, 255, 255]


def test_ok_is_one_undo_step(page):
    begin(page, "new-fill-solid")
    page.get_by_role("button", name="OK").last.click()
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(COUNT) == 1


def test_gradient_fill_runs_top_to_bottom_at_90_degrees_then_left_to_right_at_0(page):
    begin(page, "new-fill-gradient")
    top, bottom = page.evaluate(PX, [100, 2]), page.evaluate(PX, [100, 97])
    assert page.evaluate(FILL)["angle"] == 90 and top[1] > bottom[1] + 150 and page.evaluate(PX, [2, 50]) == page.evaluate(PX, [197, 50])
    set_visible(page, "Angle (degrees)", "0")
    page.get_by_role("button", name="OK").last.click()
    assert page.evaluate(FILL)["angle"] == 0
    left, right = page.evaluate(PX, [2, 50]), page.evaluate(PX, [197, 50])
    assert right[1] > left[1] + 150 and page.evaluate(PX, [100, 2]) == page.evaluate(PX, [100, 97])


def test_pattern_fill_tiles_the_chosen_pattern_and_scale_changes_the_tile(page):
    begin(page, "new-fill-pattern")
    row = lambda: [page.evaluate(PX, [x, 50]) for x in range(0, 40, 2)]
    a = row()
    assert len({tuple(p) for p in a}) >= 2
    page.get_by_role("button", name="OK").last.click()
    assert page.evaluate(FILL)["kind"] == "pattern"
    page.evaluate("window.formvis.commands.run('layer-content-options')")
    page.get_by_role("button", name="OK").last.wait_for(timeout=5000)
    set_visible(page, "Scale (%)", "200")
    page.get_by_role("button", name="OK").last.click()
    assert page.evaluate(FILL)["scale"] == 2
    assert row() != a
