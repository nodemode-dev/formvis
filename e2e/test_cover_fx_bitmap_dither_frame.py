SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
STATS = """([x0, x1]) => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(x0, 0, x1 - x0, c.height).data; let black = 0, white = 0, other = 0;
  for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v < 8) black++; else if (v > 247) white++; else other++; } return { black, white, other, n: black + white + other }; }"""


def ramp(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx; const g = k.createLinearGradient(0, 0, 100, 0);
      g.addColorStop(0, '#000'); g.addColorStop(1, '#fff'); k.fillStyle = g; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")


def to_bitmap(page, method):
    assert page.evaluate("window.formvis.commands.run('mode-bitmap')")
    page.wait_for_timeout(700)
    page.evaluate(SET, ["Method", method])
    page.wait_for_timeout(300)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1200)


def test_bitmap_threshold_splits_a_ramp_into_pure_black_and_white_at_the_midpoint(page):
    # CO-0138
    ramp(page)
    to_bitmap(page, "threshold")
    st = page.evaluate(STATS, [0, 100])
    assert st["other"] == 0 and st["black"] > 0 and st["white"] > 0, st
    assert page.evaluate(PX, [10, 30])[0] < 8 and page.evaluate(PX, [90, 30])[0] > 247
    assert abs(st["black"] / st["n"] - 0.5) < 0.12, st


def test_bitmap_diffusion_scatters_black_and_white_dots_through_the_mid_tones(page):
    # CO-0138, CO-0143
    ramp(page)
    to_bitmap(page, "diffusion")
    mid = page.evaluate(STATS, [40, 60])
    assert mid["other"] == 0 and mid["black"] > mid["n"] * 0.25 and mid["white"] > mid["n"] * 0.25, mid
    edge = page.evaluate(STATS, [0, 8])
    assert edge["black"] > edge["white"] * 4, edge


def test_bitmap_halftone_screen_and_pattern_dither_keep_only_black_and_white_with_matching_mid_tone_ink(page):
    # CO-0140, CO-0141
    for method in ("halftone", "pattern"):
        ramp(page)
        to_bitmap(page, method)
        mid = page.evaluate(STATS, [40, 60])
        assert mid["other"] == 0 and mid["black"] > mid["n"] * 0.2 and mid["white"] > mid["n"] * 0.2, (method, mid)
        left = page.evaluate(STATS, [0, 8])
        assert left["black"] > left["white"] * 3, (method, left)


def test_picture_frame_draws_ink_in_the_margin_and_leaves_the_centre_white(page):
    # PC-UI-0468
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(200, 120, 'F', 'white'); }")
    assert page.evaluate("window.formvis.commands.run('filter-pictureFrame')")
    page.wait_for_timeout(900)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1500)
    ring = page.evaluate("""() => { const c = window.formvis.engine.flattened(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let edge = 0, centre = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (x > 30 && x < 170 && y > 30 && y < 90) centre++; else edge++; } } return [edge, centre]; }""")
    assert ring[0] > 150 and ring[1] == 0, ring
    page.keyboard.press("Control+z")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [3, 3])[:3] == [255, 255, 255]
