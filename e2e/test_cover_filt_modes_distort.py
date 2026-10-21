SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
DOC = "() => { const d = window.formvis.engine.current.doc; return [d.mode, d.depth]; }"


def scene(page, fills, w=100, h=60):
    page.evaluate("""([fills, w, h]) => { const e = window.formvis.engine; e.newDocument(w, h, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      for (const [c, x, y, fw, fh] of fills) { k.fillStyle = c; k.fillRect(x, y, fw, fh); } e.activeLayer.raster.touch(); e.refresh(); }""", [fills, w, h])


def open_dialog(page, command):
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_timeout(600)


def confirm(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)


def test_shear_moves_the_top_right_and_the_bottom_left(page):
    scene(page, [("#000", 45, 0, 10, 60)])
    open_dialog(page, "filter-shear")
    page.evaluate(SET, ["Top (%)", 50])
    page.evaluate(SET, ["Bottom (%)", -50])
    page.wait_for_timeout(900)
    confirm(page)
    assert page.evaluate(PX, [70, 5])[0] == 0 and page.evaluate(PX, [30, 5])[0] == 255
    assert page.evaluate(PX, [30, 55])[0] == 0 and page.evaluate(PX, [70, 55])[0] == 255


def test_picture_frame_paints_the_border_and_leaves_the_centre(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 200, 120)], 200, 120)
    open_dialog(page, "filter-pictureFrame")
    page.wait_for_timeout(900)
    confirm(page)
    changed = page.evaluate("""() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 200, 120).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] !== 128 || d[i + 1] !== 128 || d[i + 2] !== 128) n++; return n; }""")
    assert changed > 1000, changed
    assert page.evaluate(PX, [100, 60])[:3] == [128, 128, 128]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Picture Frame"


def test_lighting_effects_spot_lights_the_centre_and_darkens_the_corners(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    open_dialog(page, "filter-lightingEffects")
    page.evaluate(SET, ["Intensity", 100])
    page.evaluate(SET, ["Light X (%)", 50])
    page.evaluate(SET, ["Light Y (%)", 50])
    page.wait_for_timeout(900)
    confirm(page)
    centre, corner = page.evaluate(PX, [50, 30]), page.evaluate(PX, [2, 2])
    assert centre[0] == 255 and corner[0] < 100, (centre, corner)


def test_multichannel_mode_is_applied_and_returns_to_rgb(page):
    scene(page, [("rgb(200,40,40)", 0, 0, 50, 60), ("rgb(40,40,200)", 50, 0, 50, 60)])
    assert page.evaluate("window.formvis.commands.run('mode-multichannel')")
    page.wait_for_timeout(1200)
    assert page.evaluate(DOC)[0] == "multichannel"
    assert page.evaluate("window.formvis.commands.run('mode-rgb')")
    page.wait_for_timeout(1200)
    assert page.evaluate(DOC)[0] == "rgb"


def test_profile_info_names_the_assumed_srgb_profile(page):
    scene(page, [("rgb(200,40,40)", 0, 0, 50, 60)])
    open_dialog(page, "profile-info")
    text = page.evaluate("document.querySelector('.cv-scrim:not([hidden])').textContent")
    assert "no profile" in text and "sRGB IEC61966-2.1" in text and "Display" in text and "XYZ" in text, text
    page.keyboard.press("Escape")


def test_32_bit_preview_options_open_only_for_a_32_bit_document(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    assert page.evaluate("window.formvis.commands.run('preview-32')") is False
    assert page.evaluate("window.formvis.commands.run('depth-32')")
    page.wait_for_timeout(1500)
    assert page.evaluate(DOC)[1] == 32
    open_dialog(page, "preview-32")
    labels = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) input')].map((i) => i.getAttribute('aria-label'))")
    assert "Exposure" in labels and "Gamma" in labels, labels
    page.keyboard.press("Escape")


def test_indexed_conversion_keeps_two_colours_in_the_color_table(page):
    scene(page, [("rgb(200,40,40)", 0, 0, 50, 60), ("rgb(40,40,200)", 50, 0, 50, 60)])
    assert page.evaluate("window.formvis.commands.run('mode-indexed')")
    page.wait_for_timeout(800)
    page.evaluate(SET, ["Colors", 2])
    page.wait_for_timeout(800)
    confirm(page)
    page.wait_for_timeout(800)
    assert page.evaluate(DOC)[0] == "indexed"
    assert page.evaluate(PX, [10, 30])[:3] == [200, 40, 40] and page.evaluate(PX, [80, 30])[:3] == [40, 40, 200]
    open_dialog(page, "color-table")
    titles = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) button[title]')].slice(0, 3).map((b) => b.title)")
    assert titles[2] == "0: #c82828", titles
    page.keyboard.press("Escape")
