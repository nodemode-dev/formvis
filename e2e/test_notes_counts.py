DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def settle(page):
    # The view fitted and the stage not moving for several frames (under load the docks can still be settling).
    page.evaluate("""async () => { const e = window.formvis.engine, key = () => { const q = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect(); return [q.fitted, q.panX, q.panY, q.zoom, r.left, r.top].join(); };
      for (let i = 0, last = '', same = 0; i < 300 && same < 4; i++) { await new Promise((r) => requestAnimationFrame(r)); const k = key(); same = k === last ? same + 1 : 0; last = k; } }""")


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def test_notes_are_pinned_written_edited_deleted_and_undone(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'N', 'white'); window.formvis.engine.setTool('note')")
    settle(page)
    x, y = scr(page, 50, 60); page.mouse.click(x, y)
    page.locator(f"{DLG} textarea").fill("Check the horizon")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Save").click()
    notes = page.evaluate("window.formvis.engine.current.doc.notes.map((n) => [Math.round(n.x), Math.round(n.y), n.text])")
    assert notes == [[50, 60, "Check the horizon"]], notes
    x, y = scr(page, 50, 60); page.mouse.click(x + 8, y + 8)                                     # click the note: it reopens
    assert page.locator(f"{DLG} textarea").input_value() == "Check the horizon"
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Cancel").click()
    x, y = scr(page, 200, 150); page.mouse.click(x, y)                                           # a new one, cancelled empty
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Cancel").click()
    assert page.evaluate("window.formvis.engine.current.doc.notes.length") == 1                    # left nothing behind
    x, y = scr(page, 50, 60); page.keyboard.down("Alt"); page.mouse.click(x + 8, y + 8); page.keyboard.up("Alt")
    assert page.evaluate("window.formvis.engine.current.doc.notes.length") == 0                    # Alt-click deletes
    page.keyboard.press("Control+z")
    assert page.evaluate("window.formvis.engine.current.doc.notes.length") == 1                    # undone


def test_counting_and_both_saved_with_the_document(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'C', 'white'); window.formvis.engine.setTool('count')")
    settle(page)
    for (px, py) in [(40, 40), (120, 80), (220, 150)]:
        x, y = scr(page, px, py); page.mouse.click(x, y)
    assert page.evaluate("window.formvis.engine.current.doc.counts.length") == 3
    x, y = scr(page, 120, 80); page.keyboard.down("Alt"); page.mouse.click(x, y); page.keyboard.up("Alt")
    assert page.evaluate("window.formvis.engine.current.doc.counts.map((c) => [Math.round(c.x), Math.round(c.y)])") == [[40, 40], [220, 150]]
    page.evaluate("window.formvis.engine.addNote({ x: 10, y: 20 }); window.formvis.engine.setNote(window.formvis.engine.activeNote, { text: 'kept' })")
    back = page.evaluate("""async () => { const io = await import('/src/io/project-io.ts'), e = window.formvis.engine;
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const d = (await io.deserialize(JSON.parse(JSON.stringify(manifest)), (n) => Promise.resolve(m.get(n)))).doc;
      return [d.counts.map((c) => [Math.round(c.x), Math.round(c.y)]), d.notes.map((n) => n.text)]; }""")
    assert back == [[[40, 40], [220, 150]], ["kept"]], back                                         # saved and read back
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('count').options(window.formvis.engine).find((x) => x.label === 'Clear').run(); }""")
    assert page.evaluate("window.formvis.engine.current.doc.counts.length") == 0
    page.keyboard.press("Control+z"); page.keyboard.press("Control+z")                            # the note, then the clear
    assert page.evaluate("window.formvis.engine.current.doc.counts.length") == 2
