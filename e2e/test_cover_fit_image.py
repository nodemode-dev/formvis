import re

SCENE = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'S', 'white'); }"""
DIM = "(() => { const d = window.formvis.engine.current.doc; return [d.width, d.height]; })()"


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_fit_image_constrains_the_document_within_the_box(page):
    # PC-UI-0033
    page.evaluate(SCENE)
    menu(page, "File", "Automate", "Fit Image")
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator("input").nth(0).fill("50")
    d.locator("input").nth(1).fill("50")
    page.click(".cv-scrim:not([hidden]) .cv-dialog-foot button:has-text('OK')")
    page.wait_for_function("window.formvis.engine.current.doc.width === 50")
    assert page.evaluate(DIM) == [50, 25]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Fit Image"
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(DIM) == [200, 100]
