PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SET = """([label, v]) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""


def develop(page, sets):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'D', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(100,100,100)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_timeout(1500)
    for label, value in sets:
        page.evaluate(SET, [label, value])
    page.wait_for_timeout(1500)
    page.locator("button.cv-btn-primary", has_text="OK").last.click()
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Develop'", timeout=10000)
    page.wait_for_timeout(800)
    return page.evaluate(PX, [50, 30])


def test_develop_exposure_doubles_and_halves_a_mid_grey(page):
    # CO-0154, PC-UI-0934
    assert develop(page, [("Exposure (EV)", 1), ("Temperature", 0), ("Saturation", 0)])[:3] == [200, 200, 200]
    assert develop(page, [("Exposure (EV)", -1), ("Temperature", 0), ("Saturation", 0)])[:3] == [50, 50, 50]


def test_develop_temperature_warms_the_picture_red_over_blue(page):
    # CO-0155
    r, g, b, _ = develop(page, [("Exposure (EV)", 0), ("Temperature", 60), ("Saturation", 0)])
    assert r > g > b
