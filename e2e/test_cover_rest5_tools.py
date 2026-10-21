PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
INKX = """() => { const c = window.formvis.engine.flattened().getContext('2d'), w = c.canvas.width, d = c.getImageData(0, 0, w, c.canvas.height).data; let lo = w, hi = -1; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) { const x = (i / 4) % w; lo = Math.min(lo, x); hi = Math.max(hi, x); } return [lo, hi]; }"""


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def stroke(page, at):
    page.evaluate("""(at) => { const e = window.formvis.engine; e.newDocument(200, 100, 'Y', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.setTool('brush'); e.brushSymmetry = { mode: 'vertical', count: 6, cx: 0, cy: 0 }; e.symmetryAt = { x: at, y: 0.5 }; }""", at)
    page.wait_for_timeout(300)
    page.mouse.move(*scr(page, 20, 50))
    page.mouse.down()
    page.mouse.move(*scr(page, 40, 50), steps=6)
    page.mouse.up()
    page.wait_for_timeout(300)
    return page.evaluate(INKX)


def test_the_symmetry_axis_position_moves_the_mirrored_stroke_with_it(page):
    centre = stroke(page, 0.5)
    quarter = stroke(page, 0.25)
    assert centre[0] < 30 and centre[1] > 160
    assert quarter[0] < 30 and 60 < quarter[1] < centre[1] - 40


def test_clipping_path_dialog_marks_one_saved_path_with_a_flatness_and_none_clears_it(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(60, 40, 'P', 'white');
      e.applySelection(E.SelectionMask.cropped(10, 10, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's');
      await window.formvis.commands.run('selection-to-work-path'); }""")
    page.evaluate("() => { const e = window.formvis.engine, w = e.paths.list.find((n) => n.work); e.renamePath(w.id, 'Outline'); }")
    page.evaluate("window.formvis.commands.run('clipping-path')")
    d = ".cv-scrim:not([hidden]) .cv-dialog"
    page.locator(d).last.wait_for()
    page.locator(f"{d} select").last.select_option(label="Outline", force=True)
    page.locator(f"{d} input[type=number]").last.fill("2.5")
    page.locator(f"{d}-foot button", has_text="OK").last.click()
    page.wait_for_timeout(400)
    assert page.evaluate("window.formvis.engine.paths.list.filter((n) => n.clipping !== undefined).map((n) => [n.name, n.clipping])") == [["Outline", 2.5]]
    page.evaluate("window.formvis.commands.run('clipping-path')")
    page.locator(d).last.wait_for()
    assert page.locator(f"{d} select").last.evaluate("(s) => s.selectedOptions[0].textContent") == "Outline"
    page.locator(f"{d} select").last.select_option(label="None", force=True)
    page.locator(f"{d}-foot button", has_text="OK").last.click()
    page.wait_for_timeout(400)
    assert page.evaluate("window.formvis.engine.paths.list.filter((n) => n.clipping !== undefined).length") == 0
