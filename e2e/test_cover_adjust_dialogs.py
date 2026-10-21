SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
LAYER_PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"


def scene(page, fills):
    page.evaluate("""(fills) => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      for (const [c, x, y, w, h] of fills) { k.fillStyle = c; k.fillRect(x, y, w, h); } e.activeLayer.raster.touch(); e.refresh(); }""", fills)


def open_dialog(page, command):
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_timeout(500)


def confirm(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(700)


def test_vibrance_lifts_a_dull_colour_and_leaves_grey_alone(page):
    scene(page, [("rgb(150,110,110)", 0, 0, 50, 60), ("rgb(128,128,128)", 50, 0, 50, 60)])
    open_dialog(page, "adj-vibrance")
    page.evaluate(SET, ["Vibrance", 80])
    page.wait_for_timeout(300)
    confirm(page)
    dull, grey = page.evaluate(PX, [10, 30]), page.evaluate(PX, [70, 30])
    assert dull[0] - dull[1] >= 50 and dull[0] > 150, dull
    assert grey[:3] == [128, 128, 128], grey


def test_color_balance_pushes_midtone_grey_toward_red(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    open_dialog(page, "adj-colorBalance")
    page.evaluate(SET, ["Cyan to Red", 60])
    page.wait_for_timeout(600)
    confirm(page)
    r, g, b, _ = page.evaluate(PX, [50, 30])
    assert r > 180 and g < 128 and b < 128, (r, g, b)


def test_channel_mixer_feeds_the_red_output_from_green(page):
    scene(page, [("rgb(200,60,40)", 0, 0, 100, 60)])
    open_dialog(page, "adj-channelMixer")
    page.evaluate(SET, ["Red", 0])
    page.evaluate(SET, ["Green", 100])
    page.wait_for_timeout(300)
    confirm(page)
    assert page.evaluate(PX, [50, 30])[:3] == [60, 60, 40]


def test_unsharp_mask_overshoots_both_sides_of_an_edge(page):
    scene(page, [("rgb(60,60,60)", 0, 0, 50, 60), ("rgb(190,190,190)", 50, 0, 50, 60)])
    open_dialog(page, "filter-unsharpMask")
    page.evaluate(SET, ["Amount (%)", 300])
    page.evaluate(SET, ["Radius (px)", 3])
    page.wait_for_timeout(500)
    confirm(page)
    col = [page.evaluate(PX, [x, 30])[0] for x in (40, 49, 50, 60)]
    assert col[0] == 60 and col[3] == 190, col
    assert col[1] < 40 and col[2] > 210, col


def test_scanlines_darken_two_rows_in_every_four(page):
    scene(page, [("#fff", 0, 0, 100, 60)])
    open_dialog(page, "filter-scanlines")
    page.wait_for_timeout(600)
    confirm(page)
    col = [page.evaluate(PX, [10, y])[0] for y in range(8)]
    assert col == [153, 153, 255, 255, 153, 153, 255, 255], col


def test_dither_turns_mid_grey_into_half_black_half_white(page):
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    open_dialog(page, "filter-dither")
    page.wait_for_timeout(600)
    confirm(page)
    counts = page.evaluate("""(() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 100, 60).data, s = {};
      for (let i = 0; i < d.length; i += 4) s[d[i]] = (s[d[i]] || 0) + 1; return s; })()""")
    assert counts == {"0": 3000, "255": 3000}, counts


def test_tonal_contrast_widens_the_step_across_an_edge(page):
    scene(page, [("rgb(100,100,100)", 0, 0, 50, 60), ("rgb(140,140,140)", 50, 0, 50, 60)])
    open_dialog(page, "filter-tonalContrast")
    page.wait_for_timeout(800)
    confirm(page)
    dark, light = page.evaluate(PX, [45, 30])[0], page.evaluate(PX, [55, 30])[0]
    assert dark < 97 and light > 143, (dark, light)


def test_color_to_alpha_clears_the_chosen_colour_and_undoes(page):
    scene(page, [("rgb(220,30,30)", 20, 10, 30, 40)])
    open_dialog(page, "filter-colorToAlpha")
    page.wait_for_timeout(300)
    confirm(page)
    white, red = page.evaluate(LAYER_PX, [5, 5]), page.evaluate(LAYER_PX, [30, 30])
    assert white[3] == 0, white
    assert red[3] > 200 and red[0] > red[1] + 100, red
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Color to Alpha"
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(LAYER_PX, [5, 5]) == [255, 255, 255, 255]
