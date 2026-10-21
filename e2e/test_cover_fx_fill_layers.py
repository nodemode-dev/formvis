PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
ROW = """(y) => { const c = window.formvis.engine.flattened(); const d = c.getContext('2d').getImageData(0, y, c.width, 1).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push(d[i]); return o; }"""


def fresh(page, w=120, h=60):
    page.evaluate("([w, h]) => { const e = window.formvis.engine; e.newDocument(w, h, 'F', 'white'); }", [w, h])


def ok(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)


def test_gradient_fill_layer_paints_a_black_to_clear_ramp_over_white_and_undo_removes_the_layer(page):
    # PC-EN-0492, SC-ED-0171
    fresh(page)
    assert page.evaluate("window.formvis.commands.run('new-fill-gradient')")
    page.wait_for_timeout(900)
    ok(page)
    assert page.evaluate("window.formvis.engine.current.doc.layers.map(l => l.name)") == ["Background", "Gradient Fill 1"]
    col = page.evaluate("() => { const c = window.formvis.engine.flattened(); const k = c.getContext('2d'); return Array.from({ length: c.height }, (_, y) => k.getImageData(5, y, 1, 1).data[0]); }")
    assert max(col) - min(col) > 150, (col[0], col[-1])
    assert all(a <= b + 2 for a, b in zip(col, col[1:])) or all(a >= b - 2 for a, b in zip(col, col[1:]))
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 1")
    assert page.evaluate(PX, [5, 30])[:3] == [255, 255, 255]


def test_pattern_fill_layer_tiles_the_checker_pattern_and_hiding_the_layer_restores_the_picture(page):
    # PC-EN-0494, PC-UI-0231, PC-UI-0940
    fresh(page)
    assert page.evaluate("window.formvis.commands.run('new-fill-pattern')")
    page.wait_for_timeout(900)
    ok(page)
    assert page.evaluate("window.formvis.engine.current.doc.layers.map(l => l.name)") == ["Background", "Pattern Fill 1"]
    row = page.evaluate(ROW, 30)
    assert len(set(row)) >= 2 and max(row) - min(row) > 40, sorted(set(row))[:6]
    page.evaluate("() => { const l = window.formvis.engine.current.doc.layers[1]; l.visible = false; window.formvis.engine.refresh(); }")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [5, 30])[:3] == [255, 255, 255]


def test_grain_adjustment_layer_adds_noise_to_flat_grey_above_without_touching_the_pixels_below_it(page):
    # CO-0198, SC-ED-0171
    fresh(page)
    page.evaluate("() => { const e = window.formvis.engine; const k = e.activeLayer.raster.ctx; k.fillStyle = 'rgb(128,128,128)'; k.fillRect(0, 0, 120, 60); e.activeLayer.raster.touch(); e.refresh(); }")
    page.evaluate("window.formvis.commands.run('new-adj-grain')")
    page.wait_for_timeout(900)
    ok(page)
    assert page.evaluate("window.formvis.engine.current.doc.layers.map(l => !!l.adjustment)") == [False, True]
    row = page.evaluate(ROW, 30)
    assert max(row) - min(row) >= 6, (min(row), max(row))
    below = page.evaluate("() => { const l = window.formvis.engine.current.doc.layers[0]; const d = l.raster.read(0, 0, 120, 60).data; return [d[0], d[1], d[2]]; }")
    assert below == [128, 128, 128]
    page.keyboard.press("Control+z")
    page.wait_for_timeout(500)
    row = page.evaluate(ROW, 30)
    assert max(row) == min(row) == 128
