import re

SCENE = """() => { const e = window.formvis.engine; e.newDocument(200, 200, 'C', 'white'); e.deselect(); const c = e.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(200,200,200)'; c.fillRect(0, 0, 100, 200); c.fillStyle = 'rgb(20,20,20)'; c.fillRect(100, 0, 100, 200); e.activeLayer.raster.touch(); }"""
CH = "([i, x, y]) => { const a = window.formvis.engine.current.doc.alphas; const m = a[a.length - 1].mask; return [a.length, m.valueAt(x, y)]; }"


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def run(page, source1_invert):
    page.evaluate(SCENE)
    menu(page, "Image", "Calculations...")
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.wait_for()
    d.locator("select[aria-label='Source 1 channel']").select_option("gray")
    if source1_invert:
        d.locator(".cv-check", has_text="Invert source 1").locator("input").check()
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.current.doc.alphas.length > 0")


def test_calculations_dialog_writes_the_gray_channel_to_a_new_alpha_channel(page):
    # PC-UI-0178
    run(page, False)
    n, light = page.evaluate(CH, [0, 50, 100])
    _, dark = page.evaluate(CH, [0, 150, 100])
    assert n == 1 and light > 180 and dark < 40, (light, dark)


def test_calculations_invert_source_1_flips_the_channel(page):
    # PC-UI-0178
    run(page, True)
    _, light = page.evaluate(CH, [0, 50, 100])
    _, dark = page.evaluate(CH, [0, 150, 100])
    assert light < 75 and dark > 215, (light, dark)
