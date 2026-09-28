VISIBLE = """[...document.querySelector('.cv-rail-tools').children].filter((c) => !c.hidden && getComputedStyle(c).display !== 'none').map((c) => c.classList.contains('cv-rail-sep') ? '-' : c.classList.contains('cv-rail-more') ? '...' : (c.getAttribute('aria-label') || ''))"""


def test_edit_toolbar_hides_a_tool_that_stays_in_the_more_list(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(200, 100, 'T', 'white')")
        page.locator(".cv-rail-more").click()
        page.locator(".cv-flyout:not([hidden]) .cv-flyout-item", has_text="Edit Toolbar").click()
        page.locator(".cv-edit-tool", has_text="Frame").locator("input").uncheck()
        page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Done").click()
        seen = page.evaluate(VISIBLE)
        assert "Frame" not in seen and seen[0] != "-" and all(not (a == "-" and b == "-") for a, b in zip(seen, seen[1:])), seen
        page.locator(".cv-rail-more").click()
        page.locator(".cv-flyout:not([hidden]) .cv-flyout-item", has_text="Elliptical Frame").click()
        assert page.evaluate("[window.formvis.engine.tool, window.formvis.engine.frameShape]") == ["frame", "ellipse"]
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert "Frame" not in page.evaluate(VISIBLE)                                            # remembered
        page.evaluate("window.formvis.engine.newDocument(200, 100, 'T2', 'white')")
        page.locator(".cv-rail-more").click()
        page.locator(".cv-flyout:not([hidden]) .cv-flyout-item", has_text="Edit Toolbar").click()
        page.locator(".cv-edit-tool", has_text="Frame").locator("input").check()
        page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Done").click()
        assert any(x in ("Frame", "Elliptical Frame") or "Frame" in x for x in page.evaluate(VISIBLE))
    finally:
        page.evaluate("localStorage.removeItem('formvis.railHidden'); window.formvis.engine.frameShape = 'rect'")
