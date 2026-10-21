# D26: the Generate panel repeated the Preferences ComfyUI and NodeMode address fields with the same accessible names.
# With the panel and Preferences both open, no two URL fields share an accessible name.

NAMES = """() => [...document.querySelectorAll('input[type=url]')].map((i) => i.getAttribute('aria-label') || (i.labels && i.labels[0] ? i.labels[0].textContent.trim() : '') || i.getAttribute('placeholder') || '')"""


def test_d26_url_fields_have_distinct_accessible_names_with_the_panel_and_preferences_open(page):
    page.evaluate("window.formvis.engine.newDocument(100, 80, 'A', 'white')")
    page.evaluate("window.formvis.commands.run('generate-panel')")
    page.wait_for_timeout(500)
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click(timeout=10000)
    names = page.evaluate(NAMES)
    assert "ComfyUI address" in names
    assert len(names) == len(set(names)), names
