SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
STYLE = """(v) => {
  const s = [...document.querySelectorAll('.cv-scrim:not([hidden]) select')].find((n) => n.getClientRects().length && [...n.options].some((o) => o.value === 'lateral'));
  if (!s) throw new Error('no Style control');
  s.value = v; s.dispatchEvent(new Event('change', { bubbles: true }));
}"""
LAYER_PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3)"
FLAT_PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def square(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = '#000'; k.fillRect(0, 0, 100, 60); k.fillStyle = '#fff'; k.fillRect(30, 15, 40, 30); e.activeLayer.raster.touch(); e.refresh(); }""")


def run_dialog(page, style, amount, angle=0):
    assert page.evaluate("window.formvis.commands.run('filter-chromaticShift')")
    page.wait_for_timeout(500)
    page.evaluate(STYLE, style)
    page.evaluate(SET, ["Amount (px)", amount])
    page.evaluate(SET, ["Angle (°)", angle])
    page.wait_for_timeout(600)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(700)


def px(page, x, y):
    return page.evaluate(LAYER_PX, [x, y])


def undo(page):
    page.evaluate("window.formvis.commands.run('undo')")
    page.wait_for_timeout(300)


def test_plates_moves_red_up_green_down_left_and_blue_down_right_then_undoes(page):
    square(page)
    run_dialog(page, "plates", 6)
    assert px(page, 50, 10) == [255, 0, 0]
    assert px(page, 26, 30) == [0, 255, 0]
    assert px(page, 74, 30) == [0, 0, 255]
    assert px(page, 50, 47) == [0, 255, 255]
    assert px(page, 50, 30) == [255, 255, 255]
    undo(page)
    assert px(page, 50, 10) == [0, 0, 0] and px(page, 26, 30) == [0, 0, 0]


def test_amount_zero_changes_nothing(page):
    square(page)
    run_dialog(page, "plates", 0)
    assert px(page, 50, 10) == [0, 0, 0] and px(page, 26, 30) == [0, 0, 0] and px(page, 50, 30) == [255, 255, 255]


def test_lateral_fringes_red_outward_and_blue_inward_from_the_centre(page):
    square(page)
    run_dialog(page, "lateral", 6)
    assert px(page, 28, 30) == [255, 0, 0]
    left_in = px(page, 31, 30)
    assert left_in[0] == 255 and left_in[1] == 255 and left_in[2] < 60
    assert px(page, 50, 30) == [255, 255, 255]


def test_linear_moves_red_and_blue_opposite_ways_along_the_angle(page):
    square(page)
    run_dialog(page, "linear", 6, 0)
    assert px(page, 75, 30) == [255, 0, 0]
    assert px(page, 25, 30) == [0, 0, 255]
    assert px(page, 30, 30) == [0, 255, 255]
    undo(page)
    run_dialog(page, "linear", 6, 90)
    assert px(page, 50, 10) == [255, 0, 0]
    assert px(page, 50, 47) == [0, 0, 255]


def test_a_chromatic_shift_filter_layer_re_edits_and_undoes(page):
    square(page)
    assert page.evaluate("window.formvis.commands.run('new-filter-layer', { filter: 'chromaticShift', settings: { lib: { chromaticShift: { style: 'linear', amount: 6, angle: 0 } } } })")
    page.wait_for_timeout(800)
    assert page.evaluate(FLAT_PX, [75, 30]) == [255, 0, 0] and page.evaluate(FLAT_PX, [25, 30]) == [0, 0, 255]
    lid = page.evaluate("window.formvis.engine.current.activeLayer.id")
    page.evaluate("(id) => document.querySelector('.cv-layers').dispatchEvent(new CustomEvent('cv:edit-adjustment', { detail: id, bubbles: true }))", lid)
    page.wait_for_timeout(800)
    page.evaluate(SET, ["Amount (px)", 10])
    page.wait_for_timeout(700)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(700)
    assert page.evaluate(FLAT_PX, [79, 30]) == [255, 0, 0]
    undo(page)
    assert page.evaluate(FLAT_PX, [79, 30]) == [0, 0, 0] and page.evaluate(FLAT_PX, [75, 30]) == [255, 0, 0]


def test_every_filter_gallery_effect_has_a_command_that_runs_with_values_and_undoes(page):
    square(page)
    ids = page.evaluate("window.formvis.commands.all().map((a) => a.id || a)")
    assert len([i for i in ids if i.startswith("filter-fx-")]) >= 40 and "filter-fx-glass" in ids
    before = [page.evaluate(FLAT_PX, [x, 30]) for x in range(26, 36)]
    assert page.evaluate("window.formvis.commands.run('filter-fx-glass', { values: { distortion: 20, texture: 'blocks' } })")
    page.wait_for_timeout(2500)
    assert [page.evaluate(FLAT_PX, [x, 30]) for x in range(26, 36)] != before
    undo(page)
    assert [page.evaluate(FLAT_PX, [x, 30]) for x in range(26, 36)] == before
    page.evaluate("window.formvis.commands.run('filter-fx-oceanRipple')")
    page.wait_for_timeout(1500)
    assert "Filter Gallery" in page.evaluate("document.querySelector('.cv-scrim:not([hidden])').innerText")
    assert "Ocean Ripple" in page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-fg-layer')].map((n) => n.textContent).join('|')")
