SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(120, 100, 'W', 'white');
  e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(30, 30, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.setTool('wand'); if (e.tool !== 'wand') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
AT = "([x, y]) => window.formvis.engine.current.selection.valueAt(x, y)"


def test_magic_wand_anti_alias_softens_the_edge(page):
    s = page.evaluate(SETUP)
    bar = page.locator(".cv-opt-group:not([hidden])")
    assert bar.locator(".cv-opt", has_text="Anti-alias").locator("input").is_checked()   # on by default
    page.mouse.click(s[0] + 50 * s[2], s[1] + 45 * s[2])
    soft = [page.evaluate(AT, [x, 45]) for x in (29, 30, 50)]
    assert soft[2] == 255 and 0 < soft[0] < 255 and 0 < soft[1] < 255, soft
    bar.locator(".cv-opt", has_text="Anti-alias").locator("input").uncheck()
    page.mouse.click(s[0] + 50 * s[2], s[1] + 45 * s[2])
    hard = [page.evaluate(AT, [x, 45]) for x in (29, 30, 50)]
    assert hard == [0, 255, 255], hard
