def open_history(page):
    page.evaluate("window.formvis.commands.run('panel-history')")
    if page.locator(".cv-history-toggle").get_attribute("aria-expanded") != "true":
        page.locator(".cv-history-toggle").click()


def rename_last(page, text):
    row = page.locator(".cv-history-row.is-snapshot").last
    row.locator(".cv-history-name").dblclick()
    page.locator(".cv-history-row.is-snapshot").last.locator(".cv-history-edit").fill(text)
    page.keyboard.press("Enter")


def test_a_snapshot_is_taken_from_the_panel_and_renamed_in_place(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'N', 'white')")
    open_history(page)
    page.locator("[data-cmd='new-snapshot']").click()
    assert page.evaluate("window.formvis.engine.snapshots.map((s) => s.name)") == ["N", "Snapshot 1"]
    rename_last(page, "Before retouch")
    assert page.evaluate("window.formvis.engine.snapshots.map((s) => s.name)") == ["N", "Before retouch"]
    assert page.locator(".cv-history-row.is-snapshot .cv-history-name").all_text_contents() == ["N", "Before retouch"]


def test_a_snapshot_name_is_cut_at_100_characters_and_escape_keeps_the_old_one(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'N', 'white')")
    open_history(page)
    page.locator("[data-cmd='new-snapshot']").click()
    rename_last(page, "x" * 130)
    assert page.evaluate("window.formvis.engine.snapshots[1].name.length") == 100
    row = page.locator(".cv-history-row.is-snapshot").last
    row.locator(".cv-history-name").dblclick()
    page.locator(".cv-history-row.is-snapshot").last.locator(".cv-history-edit").fill("dropped")
    page.keyboard.press("Escape")
    assert page.evaluate("window.formvis.engine.snapshots[1].name.length") == 100


def test_clicking_a_snapshot_returns_the_document_to_it_as_one_step(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(120, 80, 'N', 'white'); }""")
    open_history(page)
    page.locator("[data-cmd='new-snapshot']").click()
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.fg = { r: 220, g: 20, b: 20 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 120, 80, new Uint8Array(9600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }""")
    flat = "() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 10, 1, 1).data).slice(0, 3)"
    assert page.evaluate(flat) == [220, 20, 20]
    page.locator(".cv-history-row.is-snapshot").last.click()
    assert page.evaluate(flat) == [255, 255, 255]
    assert page.evaluate("window.formvis.engine.historySteps.names.at(-1)").startswith("Revert to")
    page.keyboard.press("Control+z")
    assert page.evaluate(flat) == [220, 20, 20]
