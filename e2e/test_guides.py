SETUP = """() => { const e = window.sonny.engine; e.newDocument(400, 300, 'G', 'white'); e.fit ? e.fit() : 0; e.setView({ rulers: true, guides: true, guidesLocked: false }); }"""


def stage_box(page):
    return page.evaluate("(() => { const r = document.querySelector('.cv-stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")


def guides(page):
    return page.evaluate("(window.sonny.engine.current.doc.guides || []).map((g) => [g.axis, g.at])")


def test_new_guide_dialog_undo_and_round_trip(page):
    page.evaluate(SETUP)
    page.evaluate("window.sonny.commands.run('new-guide')")
    page.wait_for_timeout(200)
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    dlg.locator("select").select_option("x")
    dlg.locator("input[type=number]").fill("123.3")
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    assert guides(page) == [["x", 123.5]]
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "New Guide"
    back = page.evaluate("""async () => { const io = await import('/src/io/project-io.ts'), e = window.sonny.engine;
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId), m = new Map(files.map((f) => [f.name, f.blob]));
      const r = await io.deserialize(manifest, (n) => Promise.resolve(m.get(n))); return r.doc.guides; }""")
    assert back == [{"axis": "x", "at": 123.5}]
    page.evaluate("window.sonny.engine.undo()")
    assert guides(page) == []


def test_drag_a_guide_out_of_the_top_ruler_then_move_and_delete_it(page):
    page.evaluate(SETUP)
    page.locator(".cv-ruler-h").wait_for(state="visible", timeout=5000)
    assert page.locator(".cv-ruler-v").is_visible()
    x, y, w, h = stage_box(page)
    page.mouse.move(x + w / 2, y + 8)
    page.mouse.down()
    page.mouse.move(x + w / 2, y + 150, steps=5)
    page.mouse.up()
    g = guides(page)
    assert len(g) == 1 and g[0][0] == "y", g
    expected = page.evaluate(f"window.sonny.engine.current.viewport.toDoc({w / 2}, 150).y")
    assert abs(g[0][1] - expected) <= 0.5
    # the Move tool drags it; dropping it on the ruler deletes it
    page.evaluate("window.sonny.commands.run('tool-move')")
    screen_y = page.evaluate("(() => { const v = window.sonny.engine.current.viewport, g = window.sonny.engine.current.doc.guides[0]; return v.panY + g.at * v.zoom; })()")
    page.mouse.move(x + 60, y + screen_y)
    page.mouse.down()
    page.mouse.move(x + 60, y + screen_y + 40, steps=4)
    page.mouse.up()
    moved = guides(page)
    assert len(moved) == 1 and abs(moved[0][1] - g[0][1]) > 1, moved
    screen_y = page.evaluate("(() => { const v = window.sonny.engine.current.viewport, g = window.sonny.engine.current.doc.guides[0]; return v.panY + g.at * v.zoom; })()")
    page.mouse.move(x + 60, y + screen_y)
    page.mouse.down()
    page.mouse.move(x + 60, y + 6, steps=4)
    page.mouse.up()
    assert guides(page) == []
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-3)") == ["New Guide", "Move Guide", "Delete Guide"]


def test_locked_guides_cannot_be_dragged_and_view_toggles_relabel(page):
    page.evaluate(SETUP)
    page.evaluate("window.sonny.engine.addGuide('x', 100)")
    page.evaluate("window.sonny.commands.run('lock-guides')")
    assert page.evaluate("window.sonny.engine.guideAt({ x: window.sonny.engine.current.viewport.panX + 100 * window.sonny.engine.current.viewport.zoom, y: 50 })") is None
    page.evaluate("window.sonny.commands.run('toggle-grid'); window.sonny.commands.run('toggle-rulers')")
    assert page.evaluate("[window.sonny.engine.view.grid, window.sonny.engine.view.rulers]") == [True, False]
    page.locator(".cv-ruler-h").wait_for(state="hidden", timeout=5000)
    page.evaluate("window.sonny.commands.run('clear-guides')")
    assert guides(page) == []
