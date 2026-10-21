SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def scene(page, fills, w=100, h=60):
    page.evaluate("""([fills, w, h]) => { const e = window.formvis.engine; e.newDocument(w, h, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      for (const [c, x, y, fw, fh] of fills) { k.fillStyle = c; k.fillRect(x, y, fw, fh); } e.activeLayer.raster.touch(); e.refresh(); }""", [fills, w, h])


def open_dialog(page, command):
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_timeout(600)


def confirm(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)


def test_selective_color_reds_less_cyan_and_yellow_shift_red_toward_magenta(page):
    scene(page, [("rgb(200,40,40)", 0, 0, 50, 60), ("rgb(40,40,200)", 50, 0, 50, 60)])
    open_dialog(page, "adj-selectiveColor")
    page.evaluate(SET, ["Cyan", -100])
    page.evaluate(SET, ["Yellow", -100])
    page.wait_for_timeout(700)
    confirm(page)
    red, blue = page.evaluate(PX, [10, 30]), page.evaluate(PX, [80, 30])
    assert red[0] > 220 and red[2] > 140 and red[1] == 40, red
    assert blue[:3] == [40, 40, 200], blue


def test_dehaze_adds_contrast_to_a_flat_grey_picture(page):
    scene(page, [("rgb(150,150,160)", 0, 0, 100, 60)])
    open_dialog(page, "adj-dehaze")
    page.evaluate(SET, ["Dehaze", 80])
    page.wait_for_timeout(700)
    confirm(page)
    r, g, b, _ = page.evaluate(PX, [50, 30])
    assert r > 155 and b > 168 and b - r > 10, (r, g, b)


def test_develop_vignette_darkens_the_corners_and_keeps_the_centre(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    open_dialog(page, "filter-develop")
    page.evaluate(SET, ["Vignette", 80])
    page.wait_for_timeout(1500)
    confirm(page)
    assert page.evaluate(PX, [1, 1])[:3] == [0, 0, 0]
    assert page.evaluate(PX, [98, 58])[:3] == [0, 0, 0]
    assert page.evaluate(PX, [50, 30])[:3] == [128, 128, 128]


def test_develop_negative_vignette_lifts_the_corners_to_white(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    open_dialog(page, "filter-develop")
    page.evaluate(SET, ["Vignette", -80])
    page.wait_for_timeout(1500)
    confirm(page)
    assert page.evaluate(PX, [1, 1])[:3] == [255, 255, 255]
    assert page.evaluate(PX, [50, 30])[:3] == [128, 128, 128]


def test_lens_correction_vignette_amount_changes_the_corners_only(page):
    scene(page, [("rgb(200,200,200)", 0, 0, 100, 60)])
    open_dialog(page, "filter-lensCorrection")
    page.evaluate(SET, ["Vignette Amount", -80])
    page.wait_for_timeout(1500)
    confirm(page)
    corner, centre = page.evaluate(PX, [2, 2]), page.evaluate(PX, [50, 30])
    assert corner[0] < 120, corner
    assert centre[:3] == [200, 200, 200], centre
