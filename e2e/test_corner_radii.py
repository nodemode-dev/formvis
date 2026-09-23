ALPHA = "([x, y]) => window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[3]"


def test_live_corners_through_the_dialog(page):
    s = page.evaluate("""() => { const e = window.sonny.engine; e.newDocument(200, 140, 'C', 'transparent');
      e.setTool('shape'); if (e.tool !== 'shape') throw new Error('tool'); e.shapeSettings = { ...e.shapeSettings, kind: 'rectangle', cornerRadius: 0 };
      const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }""")
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40, 30)); page.mouse.down(); page.mouse.move(*at(160, 110), steps=6); page.mouse.up()
    page.wait_for_timeout(300)
    box = page.evaluate("(() => { const l = window.sonny.engine.current.activeLayer; return l.shape ? [Math.round(l.transform.x), Math.round(l.transform.y), Math.round(l.transform.w), Math.round(l.transform.h), l.shape.kind] : null; })()")
    assert box and box[4] != "Ellipse", box
    x0, y0, w, h = box[:4]
    alpha = lambda x, y: page.evaluate(ALPHA, [x, y])
    assert alpha(x0 + 1, y0 + 1) > 200 and alpha(x0 + w - 2, y0 + 1) > 200   # square corners to start
    assert page.evaluate("window.sonny.commands.run('shape-corners')") is True
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator(".cv-field", has_text="Link corners").locator("input").uncheck()
    for label, v in [("Top left", "0"), ("Top right", "30"), ("Bottom right", "30"), ("Bottom left", "30")]:
        d.locator(".cv-field", has_text=label).locator("input").fill(v)
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(300)
    assert page.evaluate("window.sonny.engine.current.activeLayer.shape.cornerRadii") == [0, 30, 30, 30]
    assert alpha(x0 + 1, y0 + 1) > 200                     # top left still square
    assert alpha(x0 + w - 3, y0 + 3) == 0                  # top right now rounded away
    assert alpha(x0 + 3, y0 + h - 3) == 0                  # bottom left too
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Corner Radii"
    back = page.evaluate("""async () => { const e = window.sonny.engine, io = await import('/src/io/project-io.ts');
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const d = (await io.deserialize(manifest, (n) => Promise.resolve(m.get(n)))).doc; return d.layers.find((l) => l.shape).shape.cornerRadii; }""")
    assert back == [0, 30, 30, 30], back
    page.evaluate("window.sonny.engine.undo()")
    assert alpha(x0 + w - 3, y0 + 3) > 200
