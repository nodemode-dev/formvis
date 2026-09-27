# Layer Fill (Photoshop's): the layer's pixels fade, its styles do not; not Edit > Fill, which test_fill.py covers.
SQUARE = """async () => {
  const e = window.sonny.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'F', 'white'); e.addLayer(); e.fg = { r: 30, g: 160, b: 30 };
  e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  const fx = E.defaultEffects(); Object.assign(fx.stroke, { enabled: true, size: 8, color: { r: 0, g: 0, b: 0 } });
  e.setLayerEffects(e.current.activeLayer.id, fx);
}"""
PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
CENTRE, STROKE = [100, 50], [74, 50]


def near(p, q, d=6):
    return all(abs(a - b) <= d for a, b in zip(p, q))


def test_fill_fades_the_pixels_and_not_the_styles(page):
    page.evaluate(SQUARE)
    assert near(page.evaluate(PX, CENTRE), [30, 160, 30]) and near(page.evaluate(PX, STROKE), [0, 0, 0])
    page.evaluate("window.sonny.engine.setFill(0)")
    assert near(page.evaluate(PX, CENTRE), [255, 255, 255]), page.evaluate(PX, CENTRE)      # the pixels are gone
    assert near(page.evaluate(PX, STROKE), [0, 0, 0]), page.evaluate(PX, STROKE)            # the stroke is whole
    page.evaluate("window.sonny.engine.setFill(0.5)")
    assert near(page.evaluate(PX, CENTRE), [142, 207, 142], 8), page.evaluate(PX, CENTRE)   # half green, half white
    assert near(page.evaluate(PX, STROKE), [0, 0, 0])
    page.evaluate("window.sonny.engine.setFill(1); window.sonny.engine.setOpacity(0.5)")   # opacity fades the stroke too
    assert near(page.evaluate(PX, STROKE), [128, 128, 128], 8), page.evaluate(PX, STROKE)


def test_the_fill_field_commits_one_undo_step(page):
    page.evaluate(SQUARE)
    field = page.locator(".cv-fill-field")
    field.fill("30"); field.press("Enter")
    assert page.evaluate("window.sonny.engine.activeLayer.fill") == 0.3
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Layer Fill"
    page.keyboard.press("Control+z")
    assert page.evaluate("window.sonny.engine.activeLayer.fill ?? 1") == 1
    page.wait_for_function("document.querySelector('.cv-fill-field').value === '100'")   # the panel refreshes on the next frame
