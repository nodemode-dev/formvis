"""PC-UI-0907: a typed sum in the New Document size fields, the Resolution field, and the layer Opacity, Fill and zoom fields is worked out
(100+20 is 120), and a plain number still means itself."""


def new_dialog(page):
    from e2e.conftest import open_app
    open_app(page)
    page.evaluate("() => window.formvis.commands.run('new')")
    page.wait_for_selector(".cv-scrim:not([hidden]) .cv-dialog input[aria-label=Width]")
    return page.locator(".cv-scrim:not([hidden]) .cv-dialog")


def type_into(field, text):
    field.click()
    field.fill(text)
    field.press("Tab")


def test_new_document_size_and_resolution_take_arithmetic(browser):
    ctx = browser.new_context(viewport={"width": 1500, "height": 950})
    page = ctx.new_page()
    d = new_dialog(page)
    page.evaluate("() => { const s = document.querySelector('.cv-scrim:not([hidden]) select[aria-label=Unit]'); s.value = 'px'; s.dispatchEvent(new Event('change', { bubbles: true })); }")
    keep = d.locator("button[title='Keep the proportions']")
    if keep.get_attribute("aria-pressed") == "true":
        keep.click()
    type_into(d.locator("input[aria-label=Width]"), "100+20")
    assert d.locator("input[aria-label=Width]").input_value() == "120"
    type_into(d.locator("input[aria-label=Height]"), "(50+10)*2")
    assert d.locator("input[aria-label=Height]").input_value() == "120"
    type_into(d.locator("input[aria-label=Resolution]"), "100+44")
    assert d.locator("input[aria-label=Resolution]").input_value() == "144"
    d.get_by_role("button", name="Create").click()
    page.wait_for_function("() => window.formvis.engine.current && window.formvis.engine.current.doc.resolution === 144")
    size = page.evaluate("() => [window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]")
    ctx.close()
    assert size == [120, 120], size


def test_layer_opacity_and_fill_take_arithmetic(browser):
    ctx = browser.new_context(viewport={"width": 1500, "height": 950})
    page = ctx.new_page()
    from e2e.conftest import open_app
    open_app(page)
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(100, 100, 'O', 'white'); e.addLayer('L'); }")
    for label in ("Opacity", "Fill"):
        field = page.locator(f"input[aria-label='{label}']").first
        type_into(field, "80/2+10")
        assert field.input_value() == "50", (label, field.input_value())
    ctx.close()
