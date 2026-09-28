def client_of(page, x, y):
    """Where a document point is on screen, the view turned about the stage's centre."""
    return page.evaluate("""([x, y]) => { const v = window.formvis.engine.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y);
      const a = v.rotation * Math.PI / 180, cx = r.width / 2, cy = r.height / 2, dx = q.x - cx, dy = q.y - cy;
      return [r.left + cx + dx * Math.cos(a) - dy * Math.sin(a), r.top + cy + dx * Math.sin(a) + dy * Math.cos(a)]; }""", [x, y])


def test_the_view_turns_tools_land_where_they_point_and_it_straightens(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'R', 'white')")
    page.keyboard.press("r")
    assert page.evaluate("window.formvis.engine.tool") == "rotateView"
    r = page.locator(".cv-stage").bounding_box(); cx, cy = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
    page.mouse.move(cx + 200, cy); page.mouse.down(); page.mouse.move(cx, cy + 200, steps=10); page.mouse.up()   # a quarter turn
    rot = page.evaluate("window.formvis.engine.current.viewport.rotation")
    assert abs(rot - 90) < 1, rot
    assert "rotate(" in page.evaluate("document.querySelector('.cv-stage > canvas').style.transform")
    assert page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(150, 100, 1, 1).data).slice(0, 3)") == [255, 255, 255]   # the image unturned
    # A pencil click at a document point's place on screen paints that point.
    page.evaluate("window.formvis.engine.setTool('pencil'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.setBrush({ diameter: 3, hardness: 1 })")
    x, y = client_of(page, 60.5, 40.5); page.mouse.click(x, y)
    px = "([x, y]) => window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data[0]"
    assert page.evaluate(px, [60, 40]) == 0 and page.evaluate(px, [240, 160]) == 255
    # Shift: 15-degree steps; double-click, Escape and Reset View straighten it.
    page.evaluate("window.formvis.engine.setTool('rotateView')")
    page.keyboard.down("Shift"); page.mouse.move(cx + 200, cy); page.mouse.down(); page.mouse.move(cx + 150, cy + 150, steps=6); page.mouse.up(); page.keyboard.up("Shift")
    assert page.evaluate("window.formvis.engine.current.viewport.rotation") % 15 == 0
    page.mouse.dblclick(cx + 50, cy + 50)
    assert page.evaluate("window.formvis.engine.current.viewport.rotation") == 0
    page.evaluate("window.formvis.engine.setViewRotation(30)"); page.keyboard.press("Escape")
    assert page.evaluate("window.formvis.engine.current.viewport.rotation") == 0
    page.evaluate("window.formvis.engine.setViewRotation(-45)")
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('rotateView').options(window.formvis.engine).find((o) => o.label === 'Reset View').run(); }""")
    assert page.evaluate("window.formvis.engine.current.viewport.rotation") == 0
    assert page.evaluate("document.querySelector('.cv-stage > canvas').style.transform") == ""


def test_rotate_view_sits_with_the_hand_and_smear_keeps_its_slot(page):
    page.evaluate("window.formvis.engine.newDocument(100, 60, 'H', 'white')")
    groups = page.evaluate("(async () => { const { toolGroups } = await import('/src/ui/tool-groups.ts'); return toolGroups().map((g) => [g.key, g.tools.map((t) => t.id)]); })()")
    hand = [g for g in groups if "hand" in g[1]][0]
    assert hand[1] == ["hand", "rotateView"], hand
    assert any(g[1] == ["smear"] for g in groups), groups
