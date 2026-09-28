PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"
COL = "([x, y0, y1]) => { const d = window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y0, 1, y1 - y0).data; const out = []; for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 3]); return out; }"


def stroke(page, tool, a, b, opts=""):
    page.evaluate(f"() => {{ window.formvis.engine.setTool('{tool}'); {opts} }}")
    page.evaluate(f"""async () => {{ const R = await import('/src/extensions/registry.ts'), e = window.formvis.engine, t = R.getTool('{tool}'), ctx = {{ engine: e }};
      const P = (x, y) => ({{ doc: {{ x, y }}, button: 0, shift: false, alt: false, pressure: 1, pose: {{ tiltX: 0, tiltY: 0, twist: 0 }} }});
      t.down(ctx, P({a[0]}, {a[1]})); for (let i = 1; i <= 20; i++) t.move(ctx, P({a[0]} + ({b[0]} - {a[0]}) * i / 20, {a[1]} + ({b[1]} - {a[1]}) * i / 20)); t.up(ctx, P({b[0]}, {b[1]})); }}""")


def test_the_pencil_paints_pixel_exact_and_the_brush_does_not(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'P', 'white'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.setBrush({ diameter: 9, hardness: 1 })")
    stroke(page, 'pencil', (20, 30.3), (180, 30.3))
    col = page.evaluate(COL, [100, 20, 40])
    assert set(col[0::2]) == {0, 255} and 0 in col[0::2], col                                      # only black or white
    stroke(page, 'brush', (20, 70.3), (180, 70.3))
    col = page.evaluate(COL, [100, 60, 80])
    assert any(0 < v < 255 for v in col[0::2]), col                                                 # the Brush's edge is smoothed


def test_auto_erase_and_the_eraser_as_its_own_tool(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'E', 'white'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.bg = { r: 255, g: 255, b: 255 }; window.formvis.engine.setBrush({ diameter: 30, hardness: 1 })")
    stroke(page, 'pencil', (20, 50), (180, 50))                                                     # black band
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'), o = R.getTool('pencil').options(window.formvis.engine); o.find((x) => x.label === 'Auto Erase').set(true); }""")
    page.evaluate("window.formvis.engine.setBrush({ diameter: 6, hardness: 1 })")
    stroke(page, 'pencil', (100, 50), (100, 50.5))                                                  # starts on black: paints white
    assert page.evaluate(PX, [100, 50])[:3] == [255, 255, 255]
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('pencil').options(window.formvis.engine).find((x) => x.label === 'Auto Erase').set(false); }""")
    page.evaluate("window.formvis.engine.addLayer(); window.formvis.engine.setBrush({ diameter: 20, hardness: 1 })")
    stroke(page, 'pencil', (20, 20), (180, 20))
    page.keyboard.press("e")
    assert page.evaluate("window.formvis.engine.tool") == "eraser"
    stroke(page, 'eraser', (100, 5), (100, 35))
    assert page.evaluate(PX, [100, 20])[3] == 0 and page.evaluate(PX, [60, 20])[3] == 255              # erased where it went
    assert page.evaluate("window.formvis.engine.brushMode") == "paint"                                 # the Brush's mode left as it was


def test_the_magic_eraser_erases_the_like_area_only(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'M', 'white');
      e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(80, 30, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.setTool('magicEraser'); }""")
    names0 = page.evaluate("window.formvis.engine.current.history.past.length")
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('magicEraser').down({ engine: window.formvis.engine }, { doc: { x: 10, y: 10 }, button: 0, shift: false, alt: false }); }""")
    assert page.evaluate(PX, [10, 10])[3] == 0 and page.evaluate(PX, [190, 90])[3] == 0              # the white, gone
    assert page.evaluate(PX, [100, 50]) == [220, 20, 20, 255]                                        # the red square kept
    assert page.evaluate("window.formvis.engine.current.selection") is None                            # the selection as it was
    assert page.evaluate("window.formvis.engine.current.history.past.length") == names0 + 1            # one step
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [10, 10])[3] == 255


def test_the_brush_and_eraser_groups(page):
    page.evaluate("window.formvis.engine.newDocument(100, 60, 'G', 'white')")
    for member, want in [("brush", ["Brush", "Pencil"]), ("eraser", ["Eraser", "Background Eraser", "Magic Eraser"]), ("cloneStamp", ["Clone Stamp", "Pattern Stamp"])]:
        idx = page.evaluate(f"(async () => {{ const {{ toolGroups }} = await import('/src/ui/tool-groups.ts'); return toolGroups().findIndex((g) => g.tools.some((t) => t.id === '{member}')); }})()")
        page.locator(".cv-rail-tools .cv-tool").nth(idx).click(button="right")
        assert page.locator(".cv-flyout:not([hidden]) .cv-flyout-label").all_inner_texts() == want
        page.keyboard.press("Escape")


def test_the_pattern_stamp_paints_the_pattern_aligned_to_the_document(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'S', 'white'); window.formvis.engine.setBrush({ diameter: 40, hardness: 1, opacity: 1 })")
    stroke(page, 'patternStamp', (20, 50), (180, 50))
    got = page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine, pat = E.patternById(e.patternStampPattern) ?? E.allPatterns()[0], s = pat.surface;
      const c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const g = c.getContext('2d'); g.drawImage(s, 0, 0);
      const out = []; for (const [x, y] of [[60, 50], [101, 47], [140, 55]]) { const a = Array.from(e.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3), b = Array.from(g.getImageData(x % s.width, y % s.height, 1, 1).data).slice(0, 3); out.push([a, b]); } return out; }""")
    for a, b in got:
        assert all(abs(u - v) <= 3 for u, v in zip(a, b)), got                                    # the pattern, tiled from the origin


def test_the_background_eraser_erases_the_sampled_colour_only(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'B', 'transparent'); e.addLayer();
      e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(0, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg');
      e.fg = { r: 20, g: 40, b: 220 }; e.applySelection(E.SelectionMask.cropped(100, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      e.setBrush({ diameter: 30, hardness: 1 }); e.fg = { r: 0, g: 0, b: 0 }; }""")
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'), o = R.getTool('backgroundEraser').options(window.formvis.engine); o.find((x) => x.label === 'Sampling').set('once'); }""")
    n0 = page.evaluate("window.formvis.engine.current.history.past.length")
    stroke(page, 'backgroundEraser', (60, 50), (150, 50))                                          # starts on red, runs into blue
    assert page.evaluate(PX, [70, 50])[3] == 0                                                      # the red, erased
    assert page.evaluate(PX, [140, 50]) == [20, 40, 220, 255]                                       # the blue, kept
    assert page.evaluate("window.formvis.engine.current.history.past.length") == n0 + 1               # one step
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [70, 50]) == [220, 20, 20, 255]                                        # restored
