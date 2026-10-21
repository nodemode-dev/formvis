SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
VAL = "([x, y]) => { const s = window.formvis.engine.current.selection; return s ? s.valueAt(x, y) : 0; }"


def scene(page, fills, w=100, h=60):
    page.evaluate("""([fills, w, h]) => { const e = window.formvis.engine; e.newDocument(w, h, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      for (const [c, x, y, fw, fh] of fills) { k.fillStyle = c; k.fillRect(x, y, fw, fh); } e.activeLayer.raster.touch(); e.refresh(); }""", [fills, w, h])


def open_dialog(page, command):
    assert page.evaluate(f"window.formvis.commands.run('{command}')")
    page.wait_for_timeout(600)


def confirm(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)


def test_gaussian_blur_softens_a_hard_edge_by_radius_and_undo_restores_it(page):
    # CO-0130
    scene(page, [("rgb(0,0,0)", 0, 0, 50, 60)])
    open_dialog(page, "filter-gaussianBlur")
    page.evaluate(SET, ["Radius (px) value", 8])
    page.wait_for_timeout(900)
    confirm(page)
    edge, far_l, far_r = page.evaluate(PX, [47, 30]), page.evaluate(PX, [2, 30]), page.evaluate(PX, [97, 30])
    assert 20 < edge[0] < 235, edge
    assert far_l[0] < 10 and far_r[0] > 245, (far_l, far_r)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [47, 30])[:3] == [0, 0, 0]


def test_levels_input_black_and_white_stretch_a_mid_grey_and_midtones_lighten_it(page):
    # CO-0117, PC-EN-0223
    scene(page, [("rgb(100,100,100)", 0, 0, 100, 60)])
    open_dialog(page, "adj-levels")
    page.evaluate(SET, ["Input black", 50])
    page.evaluate(SET, ["Input white", 150])
    page.wait_for_timeout(700)
    confirm(page)
    assert page.evaluate(PX, [50, 30])[:3] == [128, 128, 128] or abs(page.evaluate(PX, [50, 30])[0] - 128) <= 2
    page.keyboard.press("Control+z")
    page.wait_for_timeout(400)
    assert page.evaluate(PX, [50, 30])[:3] == [100, 100, 100]
    open_dialog(page, "adj-levels")
    page.evaluate(SET, ["Midtones", 2])
    page.wait_for_timeout(700)
    confirm(page)
    assert page.evaluate(PX, [50, 30])[0] > 120


def test_levels_output_white_caps_the_brightest_value(page):
    # CO-0117
    scene(page, [("rgb(255,255,255)", 0, 0, 100, 60)])
    open_dialog(page, "adj-levels")
    page.evaluate(SET, ["Output white", 200])
    page.wait_for_timeout(700)
    confirm(page)
    assert abs(page.evaluate(PX, [50, 30])[0] - 200) <= 2


def test_hue_saturation_desaturates_red_to_grey_and_hue_rotates_it(page):
    # CO-0121
    scene(page, [("rgb(200,40,40)", 0, 0, 100, 60)])
    open_dialog(page, "adj-hsv")
    page.evaluate(SET, ["Saturation", -100])
    page.wait_for_timeout(700)
    confirm(page)
    r, g, b, _ = page.evaluate(PX, [50, 30])
    assert abs(r - g) <= 3 and abs(g - b) <= 3, (r, g, b)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(400)
    open_dialog(page, "adj-hsv")
    page.evaluate(SET, ["Hue", 120])
    page.wait_for_timeout(700)
    confirm(page)
    r, g, b, _ = page.evaluate(PX, [50, 30])
    assert g > r + 80 and g > b + 80, (r, g, b)


def test_intersect_mode_keeps_only_the_overlap_of_two_marquee_drags(page):
    # SC-ED-0022
    s = page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 160, 'M', 'white'); e.setTool('marquee'); e.selectionMode = 'replace';
      const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }""")
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])

    def drag(a, b):
        page.mouse.move(*at(*a)); page.mouse.down(); page.mouse.move(*at(*b), steps=8); page.mouse.up(); page.wait_for_timeout(300)
    drag((20, 20), (100, 100))
    page.keyboard.down("Shift"); page.keyboard.down("Alt")
    drag((60, 60), (140, 140))
    page.keyboard.up("Alt"); page.keyboard.up("Shift")
    assert page.evaluate(VAL, [80, 80]) > 0
    assert page.evaluate(VAL, [30, 30]) == 0
    assert page.evaluate(VAL, [120, 120]) == 0


def test_bits_per_channel_menu_commands_switch_depth_16_then_8_and_pixels_survive(page):
    # CO-0202
    scene(page, [("rgb(100,150,200)", 0, 0, 100, 60)])
    assert (page.evaluate("window.formvis.engine.current.doc.depth") or 8) == 8
    page.evaluate("window.formvis.commands.run('depth-16')")
    page.wait_for_function("window.formvis.engine.current.doc.depth === 16")
    px = page.evaluate(PX, [50, 30])
    assert abs(px[0] - 100) <= 1 and abs(px[2] - 200) <= 1, px
    page.evaluate("window.formvis.commands.run('depth-8')")
    page.wait_for_function("(window.formvis.engine.current.doc.depth || 8) === 8")
    assert abs(page.evaluate(PX, [50, 30])[1] - 150) <= 1
