SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'S', 'white');
  e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(0, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg');
  e.fg = { r: 20, g: 20, b: 220 }; e.applySelection(E.SelectionMask.cropped(100, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.fg = { r: 20, g: 220, b: 20 }; e.setBrush({ diameter: 30, hardness: 1, opacity: 1 }); e.brushFlow = 1;
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"
SET_OPTS = """async ([tool, vals]) => { const R = await import('/src/extensions/registry.ts'), o = R.getTool(tool).options(window.formvis.engine);
  for (const [l, v] of Object.entries(vals)) o.find((x) => x.label === l).set(v); }"""


def drag(page, s, a, b, steps=20):
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(*a)); page.mouse.down(); page.mouse.move(*at(*b), steps=steps); page.mouse.up()


def test_color_replacement_swaps_the_colour_under_the_stroke_and_leaves_others(page):
    s = page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('colorReplace')")
    page.evaluate(SET_OPTS, ["colorReplace", {"Tolerance": 30}])
    steps0 = page.evaluate("window.formvis.engine.current.history.past.length")
    drag(page, s, (20, 50), (180, 50))
    red_after = page.evaluate(PX, [60, 50])
    assert red_after[1] > red_after[0] + 60 and red_after[3] == 255, red_after
    assert page.evaluate(PX, [150, 50]) == [20, 20, 220, 255]
    assert page.evaluate(PX, [60, 10]) == [220, 20, 20, 255]
    assert page.evaluate("window.formvis.engine.current.history.past.length") == steps0 + 1
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [60, 50]) == [220, 20, 20, 255]


def test_mixer_brush_carries_paint_across_colours_and_one_undo_step(page):
    s = page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('mixer')")
    page.evaluate(SET_OPTS, ["mixer", {"Wet": 5, "Mix": 100, "Load": 1}])
    assert page.evaluate("window.formvis.engine.mixer.wet") == 5
    steps0 = page.evaluate("window.formvis.engine.current.history.past.length")
    drag(page, s, (20, 50), (180, 50), 30)
    start = page.evaluate(PX, [25, 50])
    assert start[1] > 30, start                                                             # the foreground green at the start
    carried = page.evaluate(PX, [110, 50])
    assert carried[0] > 30 and carried[2] > 150, carried                                    # red carried into the blue half
    assert page.evaluate(PX, [175, 50]) == [20, 20, 220, 255]                               # far end settled to what is there
    assert page.evaluate("window.formvis.engine.current.history.past.length") == steps0 + 1
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [25, 50]) == [220, 20, 20, 255]
