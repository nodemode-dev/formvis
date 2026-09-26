HOME = "(() => { const h = document.querySelector('.cv-home'); return !!h && !h.hidden; })()"


def test_home_screen_shows_hides_and_follows_its_preference(page):
    try:
        page.evaluate("localStorage.setItem('sonny.recent', JSON.stringify(['Alpha Project']))")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        assert page.evaluate(HOME)                                                   # no document: Home shows
        assert page.locator(".cv-home-item", has_text="Alpha Project").count() == 1
        page.locator(".cv-home-action", has_text="New document").click()             # New document runs File > New
        assert page.locator(".cv-scrim:not([hidden]) .cv-dialog").count() == 1
        page.keyboard.press("Escape")
        page.evaluate("window.sonny.engine.newDocument(120, 80, 'H', 'white')")
        assert not page.evaluate(HOME)                                               # a document opens: Home goes
        page.locator(".cv-brand").click()                                            # the Home button
        assert page.evaluate(HOME)
        page.keyboard.press("Escape")
        assert not page.evaluate(HOME)
        # Auto Show off: closing the last document leaves the empty workspace
        page.evaluate("localStorage.setItem('sonny.prefs', JSON.stringify({ autoShowHome: false }))")
        page.evaluate("window.sonny.commands.run('close-tab')")
        page.wait_for_function("window.sonny.engine.projects.length === 0")
        assert not page.evaluate(HOME)
    finally:
        page.evaluate("localStorage.removeItem('sonny.prefs'); localStorage.removeItem('sonny.recent')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
