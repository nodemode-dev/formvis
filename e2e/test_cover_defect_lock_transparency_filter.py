# D12: Gaussian Blur on a transparency-locked layer spread colour into empty pixels exactly as on an unlocked layer.

SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(120, 80, 'L', 'transparent'); e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(50, 30, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
ROW = "Array.from({ length: 40 }, (_, i) => window.formvis.engine.activeLayer.raster.ctx.getImageData(40 + i, 40, 1, 1).data[3])"


def blur(page):
    page.evaluate("window.formvis.commands.run('filter-gaussianBlur')")
    page.wait_for_selector(".cv-scrim:not([hidden]) .cv-dialog-foot button")
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Gaussian Blur'")
    page.wait_for_timeout(500)


def test_a_blur_does_not_spread_into_empty_pixels_when_transparency_is_locked(page):
    page.evaluate(SETUP)
    page.locator(".cv-lock-btn[data-lock='transparency']").click()
    assert page.evaluate("window.formvis.engine.activeLayer.locks") == {"transparency": True}
    before = page.evaluate(ROW)
    blur(page)
    after = page.evaluate(ROW)
    assert all(a == 0 for x, a in zip(range(40, 80), after) if x < 50 or x >= 70), after
    assert after[60 - 40] == 255 and after == before, (before, after)


def test_the_same_blur_on_an_unlocked_layer_does_spread(page):
    page.evaluate(SETUP)
    before = page.evaluate(ROW)
    blur(page)
    after = page.evaluate(ROW)
    assert after != before and any(a not in (0, 255) for a in after), (before, after)
