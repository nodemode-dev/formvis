PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def drag_doc(page, a, b):
    at = lambda p: page.evaluate("([x, y]) => { const v = window.sonny.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", p)
    x0, y0 = at(a); x1, y1 = at(b)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up()


def test_a_frame_is_drawn_and_an_imported_image_covers_it_clipped(page):
    page.evaluate("window.sonny.engine.newDocument(300, 200, 'F', 'white'); window.sonny.engine.setTool('frame')")
    drag_doc(page, [50, 50], [250, 150])
    f = page.evaluate("(() => { const l = window.sonny.engine.activeLayer; return { name: l.name, group: l.isGroup, frame: l.frame }; })()")
    assert f["name"] == "Frame 1" and f["group"] is True, f
    assert abs(f["frame"]["x"] - 50) <= 1 and abs(f["frame"]["w"] - 200) <= 2 and abs(f["frame"]["h"] - 100) <= 2, f
    page.evaluate("""() => { const c = document.createElement('canvas'); c.width = 100; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#dc1414'; g.fillRect(0, 0, 100, 100);
      window.sonny.engine.insertImages([{ name: 'red.png', width: 100, height: 100, source: c }]); }""")
    inside = page.evaluate("(() => { const e = window.sonny.engine, l = e.activeLayer, f = e.current.layer(l.parentId); return { parent: !!f && !!f.frame, t: l.transform }; })()")
    assert inside["parent"] is True and abs(inside["t"]["w"] - 200) <= 2 and abs(inside["t"]["h"] - 200) <= 2, inside   # covers the 200 x 100 frame
    assert page.evaluate(PX, [150, 100]) == [220, 20, 20]                                  # inside the frame: the image
    assert page.evaluate(PX, [150, 20]) == [255, 255, 255]                                 # the image beyond it: clipped


def test_the_elliptical_frame_from_the_flyout_and_undo(page):
    page.evaluate("window.sonny.engine.newDocument(300, 200, 'E', 'white')")
    idx = page.evaluate("(async () => { const { toolGroups } = await import('/src/ui/tool-groups.ts'); return toolGroups().findIndex((g) => g.tools.some((t) => t.id === 'frame')); })()")
    page.locator(".cv-rail-tools .cv-tool").nth(idx).click(button="right")
    page.locator(".cv-flyout:not([hidden]) .cv-flyout-item", has_text="Elliptical Frame").click()
    drag_doc(page, [60, 40], [240, 160])
    assert page.evaluate("window.sonny.engine.activeLayer.frame.shape") == "ellipse"
    n = page.evaluate("window.sonny.engine.current.doc.layers.length")
    page.keyboard.press("Control+z")
    assert page.evaluate("window.sonny.engine.current.doc.layers.length") == n - 1
    page.evaluate("window.sonny.engine.frameShape = 'rect'")
