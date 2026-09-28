INFO = "[...document.querySelectorAll('section.cv-info .cv-info-row')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.sonny.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def setup(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.sonny.engine; e.newDocument(200, 160, 'I', 'white');
      e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(0, 0, 100, 160, new Uint8Array(16000).fill(255)), 'replace', 's'); e.fill('fg');
      e.fg = { r: 20, g: 40, b: 220 }; e.applySelection(E.SelectionMask.cropped(100, 0, 100, 160, new Uint8Array(16000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }""")


def test_no_tab_is_cut_at_common_widths(page):
    for w in [1280, 1440]:
        page.set_viewport_size({"width": w, "height": 900}); page.wait_for_timeout(300)
        cut = page.evaluate("[...document.querySelectorAll('.cv-group-tab')].filter((t) => t.offsetParent && t.scrollWidth > t.clientWidth + 1).map((t) => t.textContent)")
        assert cut == [], (w, cut)
    page.set_viewport_size({"width": 1400, "height": 900})


def test_the_info_panel_and_color_samplers(page):
    setup(page)
    try:
        page.evaluate("window.sonny.commands.run('panel-info')")
        x, y = scr(page, 50.5, 80.5); page.mouse.move(x, y); page.wait_for_timeout(200)
        rows = page.evaluate(INFO)
        assert "Colour R 220 G 20 B 20" in rows and "X, Y 50, 80 px" in rows, rows
        page.evaluate("window.sonny.engine.setTool('colorSampler')")
        for (px, py) in [(30, 30), (170, 30)]:
            x, y = scr(page, px + 0.5, py + 0.5); page.mouse.click(x, y)
        page.wait_for_timeout(200)
        rows = page.evaluate(INFO)
        assert "#1 R 220 G 20 B 20" in rows and "#2 R 20 G 40 B 220" in rows, rows
        x, y = scr(page, 30.5, 30.5); page.keyboard.down("Alt"); page.mouse.click(x, y); page.keyboard.up("Alt")   # Alt-click removes
        assert page.evaluate("window.sonny.engine.measure.samplers.length") == 1
        page.evaluate("window.sonny.engine.measure.samplers.push(...Array.from({ length: 9 }, (_, i) => ({ x: 10 + i * 5, y: 100 })))")
        # (Ends with a plain value: evaluate calls an expression's function result, and on() returns the unsubscriber.)
        page.evaluate("window.__n = []; window.sonny.engine.on('notice', (n) => window.__n.push(n.text)); 0")
        x, y = scr(page, 150.5, 140.5); page.mouse.click(x, y)                                   # an eleventh: refused, and said
        assert page.evaluate("window.sonny.engine.measure.samplers.length") == 10 and any("Ten samplers" in n for n in page.evaluate("window.__n")), page.evaluate("window.__n")
    finally:
        page.evaluate("window.sonny.commands.run('panel-info')")


def test_the_ruler_measures_and_straightens(page):
    setup(page)
    page.evaluate("window.sonny.engine.setTool('ruler')")   # the layer with pixels (an empty one has nothing to straighten)
    a = scr(page, 20, 20); b = scr(page, 120, 120)
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=8); page.mouse.up()
    r = page.evaluate("(() => { const r = window.sonny.engine.measure.ruler; return [r.a.x, r.a.y, r.b.x, r.b.y]; })()")
    assert all(abs(u - v) < 0.6 for u, v in zip(r, [20, 20, 120, 120])), r
    got = page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'), o = R.getTool('ruler').options(window.sonny.engine); return Object.fromEntries(o.filter((x) => x.kind === 'readout').map((x) => [x.label, x.get()])); }""")
    assert got["A"].startswith("-45.0") and got["L"].startswith("141.4"), got
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('ruler').options(window.sonny.engine).find((x) => x.label === 'Straighten Layer').run(); }""")
    assert abs(page.evaluate("window.sonny.engine.activeLayer.transform.rotation") + 45) < 0.2
    assert page.evaluate("window.sonny.engine.measure.ruler") is None
