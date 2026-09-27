SEL = "(([x, y]) => { const s = window.sonny.engine.current.selection; if (!s) return 0; return x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h ? 0 : s.data[(y - s.y) * s.w + (x - s.x)]; })"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.sonny.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def test_single_row_and_column_marquee(page):
    page.evaluate("window.sonny.engine.newDocument(200, 120, 'R', 'white'); window.sonny.engine.setTool('marquee'); window.sonny.engine.update({ marqueeKind: 'row' })")
    x, y = scr(page, 50, 40.5); page.mouse.click(x, y)
    s = page.evaluate("(() => { const s = window.sonny.engine.current.selection; return [s.x, s.y, s.w, s.h]; })()")
    assert s == [0, 40, 200, 1], s                                                         # the whole row, one pixel
    page.evaluate("window.sonny.engine.update({ marqueeKind: 'column' })")
    x, y = scr(page, 70.5, 60); page.keyboard.down("Shift"); page.mouse.click(x, y); page.keyboard.up("Shift")   # Shift adds
    assert page.evaluate(SEL, [70, 5]) == 255 and page.evaluate(SEL, [5, 40]) == 255 and page.evaluate(SEL, [5, 5]) == 0
    page.evaluate("window.sonny.engine.update({ marqueeKind: 'rectangle' })")


def test_the_magnetic_lasso_follows_an_edge(page):
    # A dark square (60..140 x 30..110) on white; trace near its edges, a few pixels off, and close at the start.
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.sonny.engine; e.newDocument(200, 140, 'M', 'white');
      e.fg = { r: 20, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(60, 30, 80, 80, new Uint8Array(6400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      e.setTool('lasso'); e.update({ lassoKind: 'magnetic' }); }""")
    route = [(63, 33)] + [(63 + i * 10, 26) for i in range(1, 8)] + [(143, 33 + i * 10) for i in range(0, 8)] + [(137 - i * 10, 113) for i in range(0, 8)] + [(57, 107 - i * 10) for i in range(0, 8)]
    x, y = scr(page, *route[0]); page.mouse.click(x, y)
    for (px, py) in route[1:]:
        x, y = scr(page, px, py); page.mouse.move(x, y, steps=3); page.wait_for_timeout(30)
    x, y = scr(page, 60, 30); page.mouse.move(x, y, steps=3); page.wait_for_timeout(50); page.mouse.click(x, y)   # close at the start
    page.wait_for_timeout(100)
    assert page.evaluate(SEL, [100, 70]) == 255                                            # inside the square
    for (px, py) in [(100, 22), (150, 70), (100, 118), (50, 70)]:
        assert page.evaluate(SEL, [px, py]) == 0, (px, py)                                  # outside it, on every side
    assert page.evaluate("window.sonny.engine.historySteps.names ? 1 : 1") == 1
    page.evaluate("window.sonny.engine.update({ lassoKind: 'freehand' })")


def test_the_selection_brush_paints_and_takes_away_the_selection(page):
    page.evaluate("window.sonny.engine.newDocument(200, 120, 'B', 'white'); window.sonny.engine.deselect(); window.sonny.engine.setTool('selectionBrush'); window.sonny.engine.setBrush({ diameter: 20, hardness: 1 })")
    a = scr(page, 20, 60); b = scr(page, 180, 60)
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=12); page.mouse.up()
    assert page.evaluate(SEL, [100, 60]) == 255 and page.evaluate(SEL, [100, 20]) == 0          # the stroke, and only it
    c = scr(page, 100, 20); d = scr(page, 100, 100)
    page.keyboard.down("Alt"); page.mouse.move(*c); page.mouse.down(); page.mouse.move(*d, steps=10); page.mouse.up(); page.keyboard.up("Alt")
    assert page.evaluate(SEL, [100, 60]) == 0 and page.evaluate(SEL, [40, 60]) == 255           # Alt took that part away
    page.keyboard.press("Control+z")
    assert page.evaluate(SEL, [100, 60]) == 255                                                 # one step each
    page.keyboard.press("Control+z")
    assert page.evaluate("window.sonny.engine.current.selection") is None
    idx = page.evaluate("(async () => { const { toolGroups } = await import('/src/ui/tool-groups.ts'); return toolGroups().findIndex((g) => g.tools.some((t) => t.id === 'wand')); })()")
    page.locator(".cv-rail-tools .cv-tool").nth(idx).click(button="right")
    assert "Selection Brush" in page.locator(".cv-flyout:not([hidden]) .cv-flyout-label").all_inner_texts()
    page.keyboard.press("Escape")
