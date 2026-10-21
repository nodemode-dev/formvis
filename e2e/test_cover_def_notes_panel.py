# The Notes panel: its list, selecting a note, Previous and Next, editing the text, Delete and Delete All.
ACTIVE = "window.formvis.engine.activeNote"
NOTES = "window.formvis.engine.current.doc.notes.map((n) => n.id)"


def test_notes_panel_list_navigation_text_and_delete(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(400, 300, 'N', 'white');
      e.addNote({ x: 50, y: 40 }); e.addNote({ x: 200, y: 120 }); e.addNote({ x: 330, y: 250 }); }""")
    ids = page.evaluate(NOTES)
    assert len(ids) == 3
    if not page.evaluate("window.formvis.commands.get('panel-notes').checked()"):
        page.evaluate("window.formvis.commands.run('panel-notes')")
    panel = page.locator(".cv-notes-panel")
    panel.wait_for(state="visible", timeout=8000)
    rows = panel.locator(".cv-notes-row")
    page.wait_for_function("document.querySelectorAll('.cv-notes-panel .cv-notes-row').length === 3", timeout=5000)
    assert rows.count() == 3
    assert panel.locator(".cv-notes-text").is_disabled() or page.evaluate(ACTIVE) is not None

    rows.nth(1).click()
    assert page.evaluate(ACTIVE) == ids[1]
    assert panel.locator(".cv-notes-text").is_enabled()

    panel.locator("[data-act=next]").click()
    assert page.evaluate(ACTIVE) == ids[2]
    panel.locator("[data-act=next]").click()
    assert page.evaluate(ACTIVE) == ids[0]
    panel.locator("[data-act=prev]").click()
    assert page.evaluate(ACTIVE) == ids[2]

    box = panel.locator(".cv-notes-text")
    box.fill("check the sky")
    box.blur()
    page.wait_for_function(f"window.formvis.engine.current.doc.notes.find((n) => n.id === '{ids[2]}').text === 'check the sky'", timeout=5000)

    panel.locator("[data-act=delete]").click()
    assert page.evaluate(NOTES) == ids[:2]
    page.wait_for_function("document.querySelectorAll('.cv-notes-panel .cv-notes-row').length === 2", timeout=5000)

    panel.locator("[data-act=clear]").click()
    assert page.evaluate(NOTES) == []
    page.wait_for_function("document.querySelectorAll('.cv-notes-panel .cv-notes-row').length === 0", timeout=5000)
    assert panel.locator("[data-act=clear]").is_disabled()
    page.evaluate("window.formvis.engine.undo()")
    assert len(page.evaluate(NOTES)) >= 2
