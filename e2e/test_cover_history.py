FILL = """async (c) => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.fg = c;
  e.applySelection(E.SelectionMask.cropped(0, 0, 120, 80, new Uint8Array(9600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
FLAT = "() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 10, 1, 1).data).slice(0, 3)"
RED, GREEN, BLUE = {"r": 220, "g": 20, "b": 20}, {"r": 20, "g": 220, "b": 20}, {"r": 20, "g": 20, "b": 220}


def three_fills(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'HS', 'white')")
    for c in (RED, GREEN, BLUE):
        page.evaluate(FILL, c)
    page.evaluate("window.formvis.commands.run('panel-history')")
    if page.locator(".cv-history-toggle").get_attribute("aria-expanded") != "true":
        page.locator(".cv-history-toggle").click()


def test_new_document_from_state_opens_that_state_and_leaves_the_original(page):
    three_fills(page)
    page.locator(".cv-history-row[data-index='2']").click()
    assert page.evaluate(FLAT) == [220, 20, 20]
    count = page.evaluate("window.formvis.engine.projects.length")
    page.locator(".cv-state-new").click()
    page.wait_for_function("(n) => window.formvis.engine.projects.length === n + 1", arg=count)
    assert page.evaluate("window.formvis.engine.current.name") == "HS state 2"
    assert page.evaluate(FLAT) == [220, 20, 20]
    page.evaluate("(() => { const e = window.formvis.engine; e.switchTo(e.projects[0].id); })()")
    assert page.evaluate("window.formvis.engine.current.name") == "HS"
    assert page.evaluate("window.formvis.engine.current.history.steps.current") == 2
    assert page.evaluate(FLAT) == [220, 20, 20]


def test_delete_state_drops_that_step_and_every_step_after_it_with_no_redo(page):
    three_fills(page)
    page.locator(".cv-history-row[data-index='2']").click()
    page.locator(".cv-snapshot-delete").click()
    page.wait_for_function("window.formvis.engine.historySteps.names.length === 1")
    assert page.evaluate(FLAT) == [255, 255, 255]
    page.keyboard.press("Control+Shift+z")
    assert page.evaluate("window.formvis.engine.historySteps.names.length") == 1
    assert page.evaluate(FLAT) == [255, 255, 255]


def test_purge_undo_forgets_the_steps_redo_would_make_again(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'PU', 'white')")
    page.evaluate(FILL, RED)
    page.evaluate(FILL, BLUE)
    for _ in range(3):
        page.keyboard.press("Control+z")
    assert page.evaluate("window.formvis.engine.historySteps.names.length") == 6
    assert page.evaluate(FLAT) == [220, 20, 20]
    page.evaluate("window.formvis.commands.run('purge-undo')")
    page.wait_for_function("window.formvis.engine.historySteps.names.length === 3")
    assert page.evaluate(FLAT) == [220, 20, 20]
    page.keyboard.press("Control+Shift+z")
    assert page.evaluate("window.formvis.engine.current.history.steps.current") == 3
    page.keyboard.press("Control+z")
    assert page.evaluate("window.formvis.engine.current.history.steps.current") == 2
