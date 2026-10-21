from e2e.test_cover_adjust_dialogs import PX, confirm, open_dialog

POS = """([t, i, v]) => {
  const all = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].filter((n) => n.getClientRects().length && n.type === t);
  const n = all[i];
  n.value = v;
  n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true }));
}"""
CHECKER = """() => { const e = window.formvis.engine; e.newDocument(2, 2, 'R', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = '#000'; k.fillRect(0, 0, 1, 1); k.fillRect(1, 1, 1, 1); e.activeLayer.raster.touch(); e.refresh(); }"""


def resize_to_eight(page, method):
    page.evaluate(CHECKER)
    open_dialog(page, "image-size")
    page.evaluate(POS, ["text", 0, "8"])
    page.evaluate(POS, ["select-one", 1, method])
    page.wait_for_timeout(400)
    confirm(page)
    return [page.evaluate(PX, [x, 1])[0] for x in range(8)]


def test_nearest_keeps_hard_edges_when_a_2x2_image_is_enlarged(page):
    assert resize_to_eight(page, "nearest") == [0, 0, 0, 0, 255, 255, 255, 255]


def test_bicubic_blends_the_same_enlargement_into_a_ramp(page):
    row = resize_to_eight(page, "bicubic")
    assert row[0] == 0 and row[-1] == 255
    assert all(0 < v < 255 for v in row[3:6]), row
    assert row == sorted(row), row
