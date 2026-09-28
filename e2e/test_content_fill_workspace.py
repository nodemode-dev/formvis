SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(240, 120, 'F', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(220,30,30)'; c.fillRect(0, 0, 100, 120); c.fillStyle = 'rgb(30,30,220)'; c.fillRect(140, 0, 100, 120); c.fillStyle = 'rgb(128,128,128)'; c.fillRect(100, 0, 40, 120);
  l.raster.touch(); e.refresh();
  e.applySelection(E.SelectionMask.cropped(108, 45, 24, 30, new Uint8Array(720).fill(255)), 'replace', 's');
  window.formvis.commands.run('content-fill-workspace');
}"""
MEAN = "(() => { const c = window.formvis.engine.flattened().getContext('2d').getImageData(110, 50, 20, 20).data; let r = 0, b = 0; for (let i = 0; i < c.length; i += 4) { r += c[i]; b += c[i + 2]; } return [r / 400, b / 400]; })()"


def dlg(page):
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator(".cv-fill-canvas").wait_for(state="visible")
    return d


def paint_sampling_on_blue(page, d):
    box = d.locator(".cv-fill-canvas").bounding_box()
    # the 240 x 120 document fits 640 x 440 at scale 1 (capped), centred; paint the far blue side
    ox, oy = box["x"] + (640 - 240) / 2 * box["width"] / 640, box["y"] + (440 - 120) / 2 * box["height"] / 440
    k = box["width"] / 640
    page.mouse.move(ox + 200 * k, oy + 10 * k); page.mouse.down()
    for y in range(10, 120, 8):
        page.mouse.move(ox + 200 * k, oy + y * k)
        page.mouse.move(ox + 230 * k, oy + y * k)
    page.mouse.up()


def test_custom_sampling_on_the_blue_side_fills_blue_as_one_step(page):
    page.evaluate(SCENE)
    d = dlg(page)
    d.locator(".cv-field", has_text="Sampling Area").locator("select").select_option("custom")
    # clear the default area first with Alt, then paint on the blue side only
    box = d.locator(".cv-fill-canvas").bounding_box()
    page.keyboard.down("Alt")
    ox, oy, k = box["x"] + 200 * box["width"] / 640, box["y"] + 160 * box["height"] / 440, box["width"] / 640
    page.mouse.move(ox + 20 * k, oy); page.mouse.down()
    for y in range(0, 120, 6):
        for x in (20, 60, 100, 140, 180):
            page.mouse.move(ox + x * k, oy + y * k)
    page.mouse.up()
    page.keyboard.up("Alt")
    paint_sampling_on_blue(page, d)
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(1500)
    r, b = page.evaluate(MEAN)
    assert b > 150 and r < 100, (r, b)
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Content-Aware Fill"
    page.evaluate("window.formvis.engine.undo()")
    r, b = page.evaluate(MEAN)
    assert abs(r - 128) < 5 and abs(b - 128) < 5


def test_new_layer_output_and_show_result(page):
    page.evaluate(SCENE)
    d = dlg(page)
    d.locator(".cv-field", has_text="Show Result").locator("input").check()
    page.wait_for_timeout(500)
    d.locator(".cv-field", has_text="Output To").locator("select").select_option("new")
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(1500)
    r = page.evaluate("(() => { const e = window.formvis.engine, ls = e.current.doc.layers; return [ls.length, ls[ls.length - 1].name, e.historySteps.names.slice(-1)[0]]; })()")
    assert r == [2, "Content-Aware Fill", "Content-Aware Fill"], r
