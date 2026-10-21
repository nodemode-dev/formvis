SET = """([label, v]) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
MIX = """([label, v]) => { const sw = document.querySelector("[role=group][aria-label=Colours]"); const all = [...document.querySelectorAll('input')];
  const i = all.find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length && (sw.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
GET = "(label) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length); return i ? i.value : null; }"
SCENE = """() => { const e = window.formvis.engine; e.newDocument(100, 60, 'D', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(200,50,50)'; k.fillRect(0, 0, 50, 60); k.fillStyle = 'rgb(50,50,200)'; k.fillRect(50, 0, 50, 60);
  e.activeLayer.raster.touch(); e.refresh(); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def open_develop(page):
    page.evaluate(SCENE)
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_timeout(1500)


def ok(page):
    page.locator("button.cv-btn-primary", has_text="OK").last.click()
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Develop'", timeout=10000)
    page.wait_for_timeout(800)


def test_colour_mixer_reds_saturation_greys_the_red_and_leaves_the_blue(page):
    # CO-0163
    open_develop(page)
    page.locator("button[aria-label='Reds']").click()
    page.evaluate(MIX, ["Saturation", -100])
    page.wait_for_timeout(1500)
    ok(page)
    r, g, b, _ = page.evaluate(PX, [20, 30])
    assert abs(r - g) < 8 and abs(g - b) < 8, (r, g, b)
    r, g, b, _ = page.evaluate(PX, [80, 30])
    assert b > 190 and r < 80, (r, g, b)


def test_develop_settings_save_to_xmp_and_load_back_into_the_controls(page, tmp_path):
    # PC-IO-0122
    open_develop(page)
    page.locator("button[aria-label='Reds']").click()
    page.evaluate(MIX, ["Saturation", -100])
    page.evaluate(SET, ["Exposure (EV)", 0.5])
    with page.expect_download() as dl:
        page.locator("button", has_text="Save Settings...").click()
    assert dl.value.suggested_filename == "Camera Raw Settings.xmp"
    text = open(dl.value.path()).read()
    assert 'crs:Exposure2012="0.5"' in text and 'crs:SaturationAdjustmentRed="-100"' in text
    f = tmp_path / "look.xmp"
    f.write_text(text)
    page.evaluate(SET, ["Exposure (EV)", 0])
    page.locator("button[aria-label='All colours']").click()
    assert page.evaluate(GET, "Exposure (EV)") == "0"
    with page.expect_file_chooser() as fc:
        page.locator("button", has_text="Load Settings...").click()
    fc.value.set_files(str(f))
    page.wait_for_function("(l) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === l && n.getClientRects().length); return i && i.value === '0.5'; }", arg="Exposure (EV)", timeout=5000)
    ok(page)
    r, g, b, _ = page.evaluate(PX, [20, 30])
    assert abs(r - g) < 8 and abs(g - b) < 8, (r, g, b)
