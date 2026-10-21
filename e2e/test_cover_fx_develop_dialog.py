PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SET_N = """([label, v, nth]) => {
  const all = [...document.querySelectorAll('.cv-scrim:not([hidden]) input')].filter((n) => n.getAttribute('aria-label') === label && n.type !== 'checkbox');
  const i = all[nth || 0]; if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""
VIS = """([label, nth]) => { const all = [...document.querySelectorAll('.cv-scrim:not([hidden]) input')].filter((n) => n.getAttribute('aria-label') === label && n.type !== 'checkbox'); const i = all[nth || 0]; return !!i && i.getClientRects().length > 0; }"""


def scene(page, fills):
    page.evaluate("""(fills) => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      for (const [c, x, y, w, h] of fills) { k.fillStyle = c; k.fillRect(x, y, w, h); } e.activeLayer.raster.touch(); e.refresh(); }""", fills)


def opened(page):
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_timeout(1200)


def ok(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1500)


def test_develop_exposure_brightens_and_temperature_warms_a_grey_and_undo_restores_it(page):
    # PC-UI-0934
    scene(page, [("rgb(100,100,100)", 0, 0, 100, 60)])
    opened(page)
    page.evaluate(SET_N, ["Exposure (EV)", 1, 0])
    page.wait_for_timeout(1500)
    ok(page)
    assert page.evaluate(PX, [50, 30])[0] > 150
    page.keyboard.press("Control+z")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [50, 30])[:3] == [100, 100, 100]
    opened(page)
    page.evaluate(SET_N, ["Temperature", 60, 0])
    page.wait_for_timeout(1500)
    ok(page)
    r, g, b, _ = page.evaluate(PX, [50, 30])
    assert r > b + 10, (r, g, b)


def test_develop_colour_mixer_reds_saturation_desaturates_red_and_leaves_blue(page):
    # CO-0165
    scene(page, [("rgb(200,40,40)", 0, 0, 50, 60), ("rgb(40,40,200)", 50, 0, 50, 60)])
    opened(page)
    page.locator(".cv-scrim:not([hidden]) button[aria-label='Reds']").first.click()
    page.wait_for_timeout(300)
    n = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) input')].filter((n) => n.getAttribute('aria-label') === 'Saturation' && n.type !== 'checkbox').map((n) => n.getClientRects().length > 0)")
    idx = n.index(True) if True in n else 0
    for i, shown in enumerate(n):
        if shown and i != 0:
            idx = i
    page.evaluate(SET_N, ["Saturation", -100, 1])
    page.wait_for_timeout(1500)
    ok(page)
    red, blue = page.evaluate(PX, [10, 30]), page.evaluate(PX, [80, 30])
    assert max(red[:3]) - min(red[:3]) < max(blue[:3]) - min(blue[:3]) - 40, (red, blue)


def test_develop_sections_collapse_and_open_and_reset_returns_a_control_to_zero(page):
    # CO-0153
    scene(page, [("rgb(128,128,128)", 0, 0, 100, 60)])
    opened(page)
    assert page.evaluate(VIS, ["Exposure (EV)", 0])
    page.locator(".cv-scrim:not([hidden]) button", has_text="Light").first.click()
    page.wait_for_timeout(400)
    after_light = page.evaluate(VIS, ["Exposure (EV)", 0])
    page.locator(".cv-scrim:not([hidden]) button", has_text="Light").first.click()
    page.wait_for_timeout(400)
    assert page.evaluate(VIS, ["Exposure (EV)", 0]) != after_light
    page.evaluate(SET_N, ["Contrast", 40, 0])
    assert page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) input')].find((n) => n.getAttribute('aria-label') === 'Contrast').value") in ("40", 40)
    page.locator(".cv-scrim:not([hidden]) button", has_text="Reset").first.click()
    page.wait_for_timeout(500)
    vals = page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) input')].filter((n) => n.getAttribute('aria-label') === 'Contrast').map((n) => n.value)")
    assert vals and all(v in ("0", "0.0") for v in vals), vals
