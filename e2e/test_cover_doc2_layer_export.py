import io
import re

from PIL import Image

SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(60, 40, 'Q', 'transparent'); e.fg = { r: 200, g: 40, b: 40 };
  e.applySelection(E.SelectionMask.cropped(10, 5, 20, 10, new Uint8Array(200).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""


def menu(page, *path):
    if page.locator(".cv-menu:not([hidden])").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def fresh(browser):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    from e2e.conftest import URL
    page.goto(URL)
    page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    page.evaluate(SETUP)
    return ctx, page


def test_quick_export_as_png_writes_the_active_layer_alone_with_its_transparency(browser):
    # PC-UI-0203 SC-ED-0202
    ctx, page = fresh(browser)
    try:
        with page.expect_download(timeout=20000) as d:
            menu(page, "Layer", "Quick Export as PNG")
        data = open(d.value.path(), "rb").read()
        assert d.value.suggested_filename.endswith(".png") and data[:4] == b"\x89PNG"
        im = Image.open(io.BytesIO(data)).convert("RGBA")
        assert im.size == (60, 40)
        assert im.getpixel((15, 10)) == (200, 40, 40, 255)
        assert im.getpixel((1, 1))[3] == 0
    finally:
        ctx.close()


def test_layer_export_as_dialog_writes_the_layer_in_the_chosen_format(browser):
    # PC-UI-0204 PC-EN-0125
    ctx, page = fresh(browser)
    try:
        menu(page, "Layer", "Export As")
        dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
        dlg.wait_for(timeout=10000)
        assert "Export Layer As" in dlg.inner_text()
        fmt = dlg.locator("select:has(option[value=webp])").first
        fmt.select_option("webp")
        with page.expect_download(timeout=20000) as d:
            dlg.locator(".cv-dialog-foot button", has_text=re.compile("Export")).last.click()
        data = open(d.value.path(), "rb").read()
        assert d.value.suggested_filename.endswith(".webp") and data[:4] == b"RIFF" and data[8:12] == b"WEBP", d.value.suggested_filename
        im = Image.open(io.BytesIO(data)).convert("RGBA")
        assert im.size == (60, 40) and im.getpixel((1, 1))[3] == 0 and im.getpixel((15, 10))[0] > 150
    finally:
        ctx.close()
