# Where API keys are kept (1.52.5), said in Preferences > Plugins; here there is no system password store.
def test_preferences_say_where_keys_are_kept(page):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    page.wait_for_function("() => document.querySelector('.cv-keys-note').textContent.length > 0")
    assert "file on this computer only you can read" in page.locator(".cv-keys-note").inner_text()
