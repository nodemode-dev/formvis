SCENE = """() => {
  const e = window.sonny.engine;
  e.newDocument(320, 220, 'L', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#000'; c.fillRect(150, 0, 20, 220); l.raster.touch(); e.refresh();
  window.sonny.commands.run('filter-liquify');
}"""
CENTRE = "(y) => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(0, y, 320, 1).data, xs = []; for (let x = 0; x < 320; x++) if (d[x * 4] < 128) xs.push(x); return xs.length ? (xs[0] + xs[xs.length - 1] + 1) / 2 : null; }"


def drag_on_canvas(page, fx0, fy, fx1):
    box = page.locator(".cv-liquify-canvas").bounding_box()
    page.mouse.move(box["x"] + box["width"] * fx0, box["y"] + box["height"] * fy)
    page.mouse.down()
    for k in range(1, 9):
        page.mouse.move(box["x"] + box["width"] * (fx0 + (fx1 - fx0) * k / 8), box["y"] + box["height"] * fy)
    page.mouse.up()


def test_forward_warp_through_the_dialog_applies_as_one_step(page):
    page.evaluate(SCENE)
    page.locator(".cv-liquify-canvas").wait_for(state="visible")
    size = page.locator(".cv-liquify-canvas").bounding_box()
    # the layer (320 x 220) fits the 640 x 440 preview at scale 1 and centres; the bar's middle is at x 160
    drag_on_canvas(page, (160 + 160) / 640, (110 + 110) / 440, (160 + 200) / 640)
    page.wait_for_timeout(200)
    after = page.locator(".cv-liquify-canvas").bounding_box()
    assert (size["width"], size["height"]) == (after["width"], after["height"])
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(300)
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Liquify"
    assert page.evaluate(CENTRE, 110) > 170
    assert page.evaluate(CENTRE, 2) == 160
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate(CENTRE, 110) == 160


def test_cancel_changes_nothing(page):
    page.evaluate(SCENE)
    page.locator(".cv-liquify-canvas").wait_for(state="visible")
    drag_on_canvas(page, 0.5, 0.5, 0.6)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Cancel").click()
    page.wait_for_timeout(200)
    assert page.evaluate(CENTRE, 110) == 160
    assert "Liquify" not in page.evaluate("window.sonny.engine.historySteps.names")
