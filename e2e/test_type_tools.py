def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def ink_rows(page):
    """Bands of rows holding ink in the active layer (one per line of text)."""
    return page.evaluate("""(() => { const r = window.formvis.engine.activeLayer.raster, d = r.ctx.getImageData(0, 0, r.width, r.height).data; let bands = 0, on = false;
      for (let y = 0; y < r.height; y++) { let ink = false; for (let x = 0; x < r.width; x++) if (d[(y * r.width + x) * 4 + 3] > 60) { ink = true; break; } if (ink && !on) bands++; on = ink; } return bands; })()""")


def setup(page, **opts):
    page.evaluate("window.formvis.engine.newDocument(400, 260, 'T', 'white'); window.formvis.engine.setTool('type'); window.formvis.engine.typeMask = false")
    page.evaluate("""async (o) => { const { setType } = await import('/src/extensions/tools/type.ts'); setType(window.formvis.engine, { family: 'sans-serif', size: 20, lineHeight: 1.2, tracking: 0, align: 'left', direction: 'horizontal', ...o }); }""", opts)


def test_paragraph_text_wraps_in_its_box_and_clips(page):
    setup(page)
    a = scr(page, 40, 30); b = scr(page, 240, 120)
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=8); page.mouse.up()
    ed = page.locator(".cv-type-editor")
    assert "is-box" in ed.get_attribute("class")                                                  # the editor is the box
    ed.fill("the quick brown fox jumps over the lazy dog and then the dog chases the fox all the way home again and again and again until night")
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.activeLayer && window.formvis.engine.activeLayer.text")
    t = page.evaluate("(() => { const l = window.formvis.engine.activeLayer; return [Math.round(l.transform.x), Math.round(l.transform.y), l.raster.width, l.raster.height, !!l.text.box]; })()")
    assert t == [40, 30, 200, 90, True], t                                                         # at the box's corner, its size
    assert ink_rows(page) >= 3                                                                      # wrapped to several lines
    assert ink_rows(page) <= 4                                                                      # the rest clipped at the box


def test_justify_reaches_the_right_edge(page):
    right = {}
    for align in ["left", "justify"]:
        right[align] = page.evaluate("""async (al) => { const T = await import('/src/engine/text.ts'), t = { ...T.defaultText(), family: 'sans-serif', size: 20, content: 'aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo', align: al, box: { w: 200, h: 120 } };
          const r = T.renderText(t).raster, d = r.ctx.getImageData(0, 0, r.width, 30).data; let max = 0; for (let y = 0; y < 30; y++) for (let x = 0; x < r.width; x++) if (d[(y * r.width + x) * 4 + 3] > 60) max = Math.max(max, x); return max; }""", align)
    assert right["justify"] >= 190 and right["left"] < right["justify"] - 5, right                 # spread to the box's edge


def test_vertical_type_stacks_in_columns(page):
    setup(page, direction='vertical')
    x, y = scr(page, 200, 30); page.mouse.click(x, y)
    ed = page.locator(".cv-type-editor")
    assert "is-vertical" in ed.get_attribute("class")
    ed.fill("ABCDE\nFGH"); ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.activeLayer && window.formvis.engine.activeLayer.text")
    w, h = page.evaluate("[window.formvis.engine.activeLayer.raster.width, window.formvis.engine.activeLayer.raster.height]")
    assert h > w * 1.5, (w, h)                                                                     # taller than wide: stacked
    assert page.evaluate("window.formvis.engine.activeLayer.text.direction") == "vertical"


def test_a_type_mask_makes_a_selection_not_a_layer(page):
    setup(page, size=60)
    page.evaluate("window.formvis.engine.typeMask = true")
    n = page.evaluate("window.formvis.engine.current.doc.layers.length")
    x, y = scr(page, 40, 120); page.mouse.click(x, y)
    ed = page.locator(".cv-type-editor")
    assert "is-mask" in ed.get_attribute("class")
    ed.fill("MASK"); ed.press("Control+Enter")
    page.wait_for_function("!!window.formvis.engine.current.selection")
    s = page.evaluate("(() => { const s = window.formvis.engine.current.selection; let on = 0; for (const v of s.data) if (v > 128) on++; return [s.w > 100, on > 500, on < s.w * s.h * 0.8]; })()")
    assert s == [True, True, True], s                                                              # the letters' shape
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == n                      # no layer
    page.evaluate("window.formvis.engine.typeMask = false")


def test_the_box_and_direction_are_saved(page):
    page.evaluate("""async () => { const T = await import('/src/engine/text.ts'), R = await import('/src/engine/index.ts');
      const r = new R.Raster(4, 4); window.__t = T.textFromData({ content: 'x', box: { w: 120, h: 60 }, direction: 'vertical', align: 'justify' }, r); }""")
    assert page.evaluate("[window.__t.box.w, window.__t.box.h, window.__t.direction, window.__t.align]") == [120, 60, "vertical", "justify"]
