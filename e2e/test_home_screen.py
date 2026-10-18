HOME = "(() => { const h = document.querySelector('.cv-home'); return !!h && !h.hidden; })()"


def test_home_screen_shows_hides_and_follows_its_preference(page):
    try:
        page.evaluate("localStorage.setItem('formvis.recent', JSON.stringify(['Alpha Project']))")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate(HOME)                                                   # no document: Home shows
        page.locator(".cv-hf-item", has_text="Alpha Project").wait_for()              # the list fills once the library answers
        assert page.locator(".cv-hf-item", has_text="Alpha Project").count() == 1
        page.locator(".cv-home-action", has_text="New document").click()             # New document runs File > New
        assert page.locator(".cv-scrim:not([hidden]) .cv-dialog").count() == 1
        page.keyboard.press("Escape")
        page.evaluate("window.formvis.engine.newDocument(120, 80, 'H', 'white')")
        assert not page.evaluate(HOME)                                               # a document opens: Home goes
        page.locator(".cv-brand").click()                                            # the Home button
        assert page.evaluate(HOME)
        page.keyboard.press("Escape")
        assert not page.evaluate(HOME)
        # Auto Show off: closing the last document leaves the empty workspace
        page.evaluate("localStorage.setItem('formvis.prefs', JSON.stringify({ autoShowHome: false }))")
        page.evaluate("window.formvis.commands.run('close-tab')")
        page.wait_for_function("window.formvis.engine.projects.length === 0")
        assert not page.evaluate(HOME)
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs'); localStorage.removeItem('formvis.recent')")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
