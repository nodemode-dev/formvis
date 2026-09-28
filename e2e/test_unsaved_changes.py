DLG = ".cv-scrim:not([hidden]) .cv-savechanges"
COUNT = "window.formvis.engine.projects.length"


def modified_doc(page, name):
    page.evaluate(f"window.formvis.engine.newDocument(120, 80, '{name}', 'white'); window.formvis.engine.addLayer()")
    assert page.evaluate("window.formvis.engine.current.modified") is True


def test_cancel_keeps_it_open_and_dont_save_closes_it(page):
    modified_doc(page, "Keep Me")
    n = page.evaluate(COUNT)
    page.evaluate("window.formvis.commands.run('close-tab')")
    d = page.locator(DLG)
    d.wait_for()
    assert d.locator(".cv-save-q strong").inner_text() == "Keep Me"                  # the name in bold
    d.locator("button", has_text="Cancel").click()
    assert page.evaluate(COUNT) == n and not page.locator(DLG).count()
    page.evaluate("window.formvis.commands.run('close-tab')")
    page.locator(DLG).locator("button", has_text="Save").last.wait_for()
    page.locator(DLG).locator("button", has_text="Don’t Save").click()
    page.wait_for_function(f"{COUNT} === {n - 1}")


def test_save_saves_then_closes(page):
    import time
    name = f"Saved Then Closed {int(time.time() * 1000)}"        # unique, so the library has no project by this name
    modified_doc(page, name)
    n = page.evaluate(COUNT)
    page.evaluate("window.formvis.commands.run('close-tab')")
    page.locator(DLG).locator(".cv-dialog-foot button", has_text="Save").last.click()
    # Never saved, so formvis's Save names it first ("Save to Library"), offering its own name.
    prompt = page.locator(".cv-scrim:not([hidden]) .cv-dialog input[type=text]").first
    prompt.wait_for()
    assert prompt.input_value() == name
    prompt.press("Enter")
    page.wait_for_function(f"{COUNT} === {n - 1}", timeout=15000)       # closed once saved
    names = page.evaluate("(async () => (await (await import('/src/io/api.ts')).api.library()).map((i) => i.name))()")   # the app's own reading
    assert name in names, names


def test_an_unmodified_document_closes_without_asking(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'Clean', 'white')")
    n = page.evaluate(COUNT)
    page.evaluate("window.formvis.commands.run('close-tab')")
    page.wait_for_function(f"{COUNT} === {n - 1}")
    assert not page.locator(DLG).count()
