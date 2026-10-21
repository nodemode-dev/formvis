D = ".cv-scrim:not([hidden]) .cv-dialog"


def test_restore_default_styles_brings_back_the_built_ins_and_a_double_click_renames_a_style_that_the_layer_style_dialog_then_lists(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'St', 'white')")
    page.evaluate("window.formvis.commands.run('panel-styles')")
    page.wait_for_timeout(800)
    btn = page.locator('.cv-panel-foot [data-act="defaults"]:visible').first
    btn.click()
    page.wait_for_timeout(600)
    tiles = page.locator(".cv-style-tile[data-id^='default-']")
    n = tiles.count()
    assert n >= 1
    first = tiles.first.get_attribute("data-id")
    tiles.first.dblclick()
    page.locator(D).last.wait_for()
    page.locator(f"{D} input[type=text], {D} input:not([type])").last.fill("My Glow")
    page.locator(f"{D}-foot button", has_text="Rename").last.click()
    page.wait_for_timeout(600)
    assert page.locator(f".cv-style-tile[data-id='{first}']").first.get_attribute("title") in ("My Glow", "My Glow (Defaults)") or "My Glow" in (page.locator(f".cv-style-tile[data-id='{first}']").first.get_attribute("title") or "")
    btn.click()
    page.wait_for_timeout(600)
    assert page.locator(".cv-style-tile[data-id^='default-']").count() == n
    page.evaluate("window.formvis.commands.run('layer-style')")
    page.locator(D).last.wait_for()
    page.wait_for_timeout(1000)
    opts = page.locator(f"{D} select").filter(has=page.locator("option", has_text="Choose a saved style")).first.evaluate("(s) => [...s.options].map((o) => o.textContent)")
    assert "My Glow" in opts
