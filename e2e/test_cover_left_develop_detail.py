SET = """([label, v]) => { const i = [...document.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
SCENE = """() => { const e = window.formvis.engine; e.newDocument(100, 60, 'D', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(60,60,60)'; k.fillRect(0, 0, 50, 60); k.fillStyle = 'rgb(180,180,180)'; k.fillRect(50, 0, 50, 60);
  let s = 12345; const r = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < 60; y++) for (let x = 21; x < 40; x++) { const g = 60 + Math.round((r() - 0.5) * 60); k.fillStyle = `rgb(${g},${g},${g})`; k.fillRect(x, y, 1, 1); }
  e.activeLayer.raster.touch(); e.refresh(); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
VAR = "() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(22, 0, 17, 60).data; let s = 0, n = 0, q = 0; for (let i = 0; i < d.length; i += 4) { s += d[i]; q += d[i] * d[i]; n++; } const m = s / n; return q / n - m * m; }"


def develop(page, sets, probe):
    page.evaluate(SCENE)
    assert page.evaluate("window.formvis.commands.run('filter-develop')")
    page.wait_for_timeout(1500)
    for label, value in sets:
        page.evaluate(SET, [label, value])
    page.wait_for_timeout(1500)
    page.locator("button.cv-btn-primary", has_text="OK").last.click()
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Develop'", timeout=10000)
    page.wait_for_timeout(800)
    return page.evaluate(probe) if isinstance(probe, str) else page.evaluate(PX, probe)


def test_develop_sharpening_overshoots_both_sides_of_an_edge(page):
    # CO-0167
    assert develop(page, [("Sharpening", 0)], [48, 30])[:3] == [60, 60, 60]
    dark, light = develop(page, [("Sharpening", 100)], [48, 30])[0], page.evaluate(PX, [51, 30])[0]
    assert dark < 55 and light > 187, (dark, light)


def test_develop_noise_reduction_luminance_cuts_the_variance_of_noise(page):
    # CO-0168
    base = develop(page, [("Luminance", 0)], VAR)
    reduced = develop(page, [("Luminance", 100)], VAR)
    assert base > 150 and reduced < base / 4, (base, reduced)


def test_develop_parametric_curve_shadows_lifts_and_lowers_the_dark_tones(page):
    # CO-0160
    lifted = develop(page, [("Curve Shadows", 100)], [10, 30])[0]
    lowered = develop(page, [("Curve Shadows", -100)], [10, 30])[0]
    assert lifted > 85 and lowered < 35, (lifted, lowered)
    assert develop(page, [("Curve Highlights", 100)], [90, 30])[0] > 195
