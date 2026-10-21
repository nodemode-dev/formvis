import json

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
E = "window.formvis.engine"
COUNT = """(() => { const c = document.querySelector('.cv-overlay-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"""
PILLS = "[...document.querySelectorAll('.cv-pills .cv-pill')].filter((x) => !x.hidden).map((x) => x.textContent)"


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def cmd(page, name):
    page.evaluate(f"window.formvis.commands.run('{name}')")
    page.wait_for_timeout(300)


def prefs(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.prefs') || '{}'"))


def wipe(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)


def test_grid_settings_opens_the_guides_and_grid_page_and_its_spacing_changes_the_drawn_grid_and_is_kept(page):
    wipe(page)
    try:
        page.evaluate(f"{E}.newDocument(400, 300, 'G', 'white')")
        page.wait_for_timeout(800)
        cmd(page, "toggle-grid")
        wide = page.evaluate(COUNT)
        assert wide > 0
        assert page.evaluate(f"{E}.gridPixels()") == 100
        cmd(page, "grid-settings")
        page.wait_for_timeout(500)
        assert page.locator(f"{DLG} .cv-prefs-page[data-section='Guides & Grid']").is_visible()
        field = page.locator(f"{DLG} .cv-field", has_text="Gridline Every").locator("input").first
        field.fill("50")
        field.press("Tab")
        page.wait_for_timeout(500)
        assert prefs(page)["gridSpacing"] == 50
        assert page.evaluate(f"{E}.gridPixels()") == 50
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        assert page.evaluate(COUNT) > wide * 1.5
        reload(page)
        assert prefs(page)["gridSpacing"] == 50
        page.evaluate(f"{E}.newDocument(400, 300, 'G', 'white')")
        page.wait_for_timeout(500)
        assert page.evaluate(f"{E}.gridPixels()") == 50
    finally:
        wipe(page)


def test_the_status_pills_over_the_canvas_show_zoom_flip_and_the_view_modes_and_hide_again(page):
    wipe(page)
    try:
        page.evaluate(f"{E}.newDocument(400, 300, 'P', 'white')")
        page.wait_for_timeout(800)
        page.evaluate(f"{E}.zoomTo(2)")
        page.wait_for_timeout(300)
        assert page.evaluate(PILLS) == ["200%"]
        cmd(page, "flip-view-h")
        assert page.evaluate(PILLS) == ["200%", "Flipped"]
        cmd(page, "pixel-art-preview")
        assert page.evaluate(PILLS) == ["200%", "Flipped", "Pixel Art"]
        cmd(page, "pattern-preview")
        assert page.evaluate(PILLS) == ["200%", "Flipped", "Pattern Pixel Art"]
        cmd(page, "flip-view-h")
        cmd(page, "pixel-art-preview")
        cmd(page, "pattern-preview")
        assert page.evaluate(PILLS) == ["200%"]
    finally:
        wipe(page)
