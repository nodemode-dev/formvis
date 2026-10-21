import json

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(500)


def flip(page, label):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(f"{DLG} .cv-prefs-railtab", has_text="Type").first.click()
    box = page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first
    box.wait_for()
    box.click()
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def stored(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.prefs') || '{}'"))


def new_text_layer(page, typed, commit_with_escape=False):
    page.evaluate("window.formvis.engine.newDocument(500, 300, 'T', 'white')")
    page.wait_for_timeout(500)
    box = page.locator(".cv-stage").bounding_box()
    page.keyboard.press("t")
    page.wait_for_timeout(300)
    page.mouse.click(box["x"] + box["width"] / 2 - 100, box["y"] + box["height"] / 2)
    page.wait_for_timeout(500)
    page.keyboard.type(typed)
    page.wait_for_timeout(200)
    if commit_with_escape:
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)


def test_use_smart_quotes_curls_typed_quotes_in_text_and_is_kept_after_a_reload(page):
    try:
        new_text_layer(page, 'a "b" c')
        assert page.locator("textarea").first.input_value() == 'a "b" c'
        page.keyboard.press("Escape")
        page.keyboard.press("Escape")
        flip(page, "Use Smart Quotes")
        assert stored(page)["smartQuotes"] is True
        reload(page)
        assert stored(page)["smartQuotes"] is True
        new_text_layer(page, 'a "b" c \'d\'')
        assert page.locator("textarea").first.input_value() == "a “b” c ‘d’"
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        reload(page)


def test_escape_commits_text_edits_keeps_the_typed_text_instead_of_dropping_it(page):
    try:
        new_text_layer(page, "kept words", commit_with_escape=True)
        before = page.evaluate("(window.formvis.engine.activeLayer.text || {}).content || null")
        flip(page, "Escape Commits Text Edits")
        assert stored(page)["escCommit"] is True
        reload(page)
        new_text_layer(page, "kept words", commit_with_escape=True)
        after = page.evaluate("(window.formvis.engine.activeLayer.text || {}).content || null")
        assert after == "kept words", (before, after)
        assert before != "kept words", (before, after)
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        reload(page)
