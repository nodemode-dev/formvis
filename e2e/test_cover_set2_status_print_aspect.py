import re

PAGE = "http://127.0.0.1:5190"


def menu(page, top, parent, label):
    page.locator(".cv-menu-btn", has_text=top).first.click()
    if parent:
        page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(parent) + "$"))).first.hover()
        page.wait_for_timeout(200)
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(label) + "$"))).last.click()
    page.wait_for_timeout(300)


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(500)


def test_print_size_zooms_to_the_size_the_document_would_print_at(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'P', 'white', 300)")
    page.wait_for_timeout(300)
    menu(page, "View", None, "Print Size")
    assert page.locator(".cv-st-zoom").input_value() == "32%"
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'Q', 'white', 96)")
    page.wait_for_timeout(300)
    menu(page, "View", None, "Print Size")
    assert page.locator(".cv-st-zoom").input_value() == "100%"
    assert abs(page.evaluate("window.formvis.engine.current.viewport.zoom") - 1) < 0.001


def test_pixel_aspect_ratio_preset_shows_in_the_status_bar_and_the_menu_checks_it(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'A', 'white')")
    page.wait_for_timeout(300)
    assert page.locator(".cv-st-par").inner_text() == ""
    menu(page, "Image", "Pixel Aspect Ratio", "DVCPRO HD 1080 (1.5)")
    assert page.evaluate("window.formvis.engine.current.doc.pixelAspect") == 1.5
    assert page.locator(".cv-st-par").inner_text() == "PAR 1.5"
    page.locator(".cv-menu-btn", has_text="Image").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has=page.locator(".cv-menu-label", has_text=re.compile("^Pixel Aspect Ratio$"))).first.hover()
    page.wait_for_timeout(200)
    on = page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^DVCPRO HD 1080"))).last
    assert "is-checked" in (on.get_attribute("class") or "")
    page.keyboard.press("Escape")
    page.keyboard.press("Escape")
    menu(page, "Image", "Pixel Aspect Ratio", "HDV 1080 (1.33)")
    assert page.locator(".cv-st-par").inner_text() == "PAR 1.33"
    menu(page, "Image", "Pixel Aspect Ratio", "Square (1)")
    assert page.locator(".cv-st-par").inner_text() == ""


def test_status_bar_zoom_field_dimensions_and_the_document_readout_that_is_kept_after_a_reload(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'S', 'white', 150)")
        page.wait_for_timeout(300)
        assert page.locator(".cv-st-dims").inner_text().startswith("400")
        z = page.locator(".cv-st-zoom")
        z.click()
        z.fill("50")
        z.press("Enter")
        page.wait_for_timeout(300)
        assert abs(page.evaluate("window.formvis.engine.current.viewport.zoom") - 0.5) < 0.001
        assert z.input_value() == "50%"
        page.locator(".cv-st-btn[data-cmd=zoom-in]").click()
        page.wait_for_timeout(300)
        assert page.evaluate("window.formvis.engine.current.viewport.zoom") > 0.5
        info = page.locator(".cv-st-info")
        assert info.inner_text().startswith("Doc:")
        info.click()
        assert "sRGB" in info.inner_text() or "/8" in info.inner_text()
        info.click()
        assert info.inner_text() == "150 ppi"
        assert page.evaluate("localStorage.getItem('formvis_status_info')") == "resolution"
        reload(page)
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'S', 'white', 150)")
        page.wait_for_timeout(400)
        assert page.locator(".cv-st-info").inner_text() == "150 ppi"
        page.locator(".cv-st-info").click(modifiers=["Shift"])
        assert "/8" in page.locator(".cv-st-info").inner_text() or "sRGB" in page.locator(".cv-st-info").inner_text()
    finally:
        page.evaluate("localStorage.removeItem('formvis_status_info')")
        reload(page)
