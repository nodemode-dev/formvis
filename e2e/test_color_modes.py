# Color modes as Photoshop's (1.50.2, the owner's walkthrough: Color Mode offered RGB alone).
SCENE = """async () => { const e = window.sonny.engine; e.newDocument(200, 100, 'M', 'white'); const c = e.activeLayer.raster.ctx;
  const g = c.createLinearGradient(0, 0, 200, 0); g.addColorStop(0, 'rgb(220,30,30)'); g.addColorStop(0.5, 'rgb(40,160,60)'); g.addColorStop(1, 'rgb(30,60,210)');
  c.fillStyle = g; c.fillRect(0, 0, 200, 100); e.activeLayer.raster.touch();
  await e.createTextLayer({ x: 10, y: 60 }, { ...e.textSettings, content: 'Hi', size: 40, color: { r: 220, g: 30, b: 30 }, box: null, direction: 'horizontal' }); }"""
PX = "([x, y]) => Array.from(window.sonny.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
TAB = "(document.querySelector('.cv-tab.is-active .cv-tab-mode') || {}).textContent"


def tab_is(page, want):
    page.wait_for_function(f"(document.querySelector('.cv-tab.is-active .cv-tab-mode') || {{}}).textContent === '{want}'", timeout=5000)
    return True


def test_grayscale_keeps_type_editable_and_greys_the_colours(page):
    page.evaluate(SCENE)
    page.evaluate("window.sonny.commands.run('mode-grayscale')")
    for x in (20, 100, 180):
        r, g, b, a = page.evaluate(PX, [x, 20])
        assert r == g == b, (x, r, g, b)                                                     # grey
    assert page.evaluate("(async () => { const T = await import('/src/engine/text.ts'); const l = window.sonny.engine.current.doc.layers.find((x) => x.text); return T.liveText(l) && l.text.color.r === l.text.color.g; })()")
    page.evaluate("window.sonny.engine.fg = { r: 220, g: 30, b: 30 }")
    fg = page.evaluate("window.sonny.engine.fg")
    assert fg["r"] == fg["g"] == fg["b"], fg                                                  # the picker kept to grey
    assert tab_is(page, "Gray/8")
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [20, 20])[:3] != page.evaluate(PX, [20, 20])[1:4] and page.evaluate("window.sonny.engine.current.doc.mode ?? 'rgb'") == "rgb"


def test_bitmap_is_black_and_white_and_dither_mixes_them(page):
    for method, mixed in (("threshold", False), ("dither", True)):
        page.evaluate(SCENE)
        page.evaluate("window.sonny.engine.fg = { r: 128, g: 128, b: 128 }")
        page.evaluate("(m) => window.sonny.engine.convertMode('bitmap', { dither: m === 'dither' })", method)
        vals = page.evaluate("""(() => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(90, 0, 20, 100).data, s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]); return [...s]; })()""")
        assert set(vals) <= {"0,0,0,255", "255,255,255,255"}, vals                           # black and white only
        assert (len(vals) == 2) == mixed, (method, vals)                                       # dither mixes; threshold is one
        assert page.evaluate("window.sonny.engine.current.doc.layers.length") == 1
    assert page.evaluate("window.sonny.engine.fg") in ({"r": 0, "g": 0, "b": 0}, {"r": 255, "g": 255, "b": 255})


def test_indexed_is_exact_or_adaptive_and_is_saved(page):
    page.evaluate("""() => { const e = window.sonny.engine; e.newDocument(90, 30, 'I', 'white'); const c = e.activeLayer.raster.ctx;
      c.fillStyle = 'rgb(200,0,0)'; c.fillRect(0, 0, 30, 30); c.fillStyle = 'rgb(0,200,0)'; c.fillRect(30, 0, 30, 30); c.fillStyle = 'rgb(0,0,200)'; c.fillRect(60, 0, 30, 30); e.activeLayer.raster.touch(); }""")
    page.evaluate("window.sonny.engine.convertMode('indexed')")
    assert page.evaluate("window.sonny.engine.current.doc.palette.length") == 3                  # exact
    page.evaluate(SCENE)
    page.evaluate("window.sonny.engine.convertMode('indexed', { colors: 16 })")
    ok = page.evaluate("""(() => { const e = window.sonny.engine, pal = new Set(e.current.doc.palette.map((c) => c.r + ',' + c.g + ',' + c.b)), d = e.flattened().getContext('2d').getImageData(0, 0, 200, 100).data;
      for (let i = 0; i < d.length; i += 4) if (!pal.has(d[i] + ',' + d[i + 1] + ',' + d[i + 2])) return false; return pal.size <= 16; })()""")
    assert ok                                                                                 # only palette colours, at most 16
    back = page.evaluate("""async () => { const io = await import('/src/io/project-io.ts'), e = window.sonny.engine; const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const d = (await io.deserialize(JSON.parse(JSON.stringify(manifest)), (n) => Promise.resolve(m.get(n)))).doc; return [d.mode, d.palette.length === e.current.doc.palette.length]; }""")
    assert back == ["indexed", True], back
    assert tab_is(page, "Index")


def test_new_document_modes_and_flatten_image(page):
    page.evaluate("window.sonny.commands.run('new')")
    page.locator("select[aria-label='Color Mode']").select_option("bitmap")
    assert page.locator("select[aria-label='Bit depth'] option").all_inner_texts() == ["1 bit"]
    page.locator("select[aria-label='Color Mode']").select_option("grayscale")
    assert page.locator("select[aria-label='Bit depth'] option").all_inner_texts() == ["8 bit"]
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Create").click()
    assert page.evaluate("window.sonny.engine.current.doc.mode") == "grayscale" and tab_is(page, "Gray/8")
    page.evaluate("window.sonny.engine.newDocument(100, 60, 'F', 'white'); window.sonny.engine.addLayer(); window.sonny.engine.addLayer()")
    page.evaluate("(() => { const c = window.sonny.engine.activeLayer; window.sonny.engine.fg = { r: 10, g: 120, b: 200 }; window.sonny.engine.paintBucket({ x: 50, y: 30 }); })()")
    before = page.evaluate(PX, [50, 30])
    page.evaluate("window.sonny.commands.run('flatten')")
    assert page.evaluate("window.sonny.engine.current.doc.layers.map((l) => l.name)") == ["Background"] and page.evaluate(PX, [50, 30]) == before


def test_wet_edges_keep_a_whole_strokes_rim(page):
    page.evaluate("""() => { const e = window.sonny.engine; e.newDocument(300, 120, 'W', 'transparent'); e.addLayer(); e.setTool('brush'); e.setBrushMode('paint'); e.fg = { r: 0, g: 0, b: 0 };
      e.brushShape = { ...e.brushShape, spacing: null, wetEdges: true, noise: false }; e.setBrush({ diameter: 40, hardness: 1, opacity: 1 });
      e.beginStroke({ x: 20, y: 60 }, false, 1); for (let i = 1; i <= 40; i++) e.strokeTo({ x: 20 + 260 * i / 40, y: 60 }, 1); e.endStroke(); e.brushShape = { ...e.brushShape, wetEdges: false }; }""")
    col = page.evaluate("(() => { const d = window.sonny.engine.activeLayer.raster.ctx.getImageData(150, 40, 1, 40).data, a = []; for (let i = 3; i < d.length; i += 4) a.push(d[i]); return a; })()")
    middle, rim = col[20], max(col[0:6])
    assert middle < rim - 60, col                                                              # the middle lighter along the stroke


def test_new_document_says_what_is_not_offered_and_sizes_by_mode(page):
    # 1.50.2 claimed this note and did not show it; the size was reckoned as RGB for every mode.
    page.evaluate("window.sonny.commands.run('new')")
    note = page.locator(".cv-scrim:not([hidden]) .cv-nd-note")
    assert note.is_visible() and "CMYK" in note.inner_text() and "32 bit" in note.inner_text()
    page.locator(".cv-scrim:not([hidden]) input[aria-label='Width']").fill("1920")
    page.locator(".cv-scrim:not([hidden]) input[aria-label='Height']").fill("1080")
    sizes = {}
    for m in ["rgb", "grayscale", "bitmap"]:
        page.locator("select[aria-label='Color Mode']").select_option(m)
        sizes[m] = page.locator(".cv-scrim:not([hidden]) .cv-nd-meta").inner_text()
    assert "5.9 MB" in sizes["rgb"] and "2.0 MB" in sizes["grayscale"] and "0.2 MB" in sizes["bitmap"], sizes
    page.keyboard.press("Escape")
