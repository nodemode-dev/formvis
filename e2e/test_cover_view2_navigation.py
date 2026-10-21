E = "window.formvis.engine"
VP = f"[{E}.current.viewport.zoom, {E}.current.viewport.panX, {E}.current.viewport.panY]"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def cmd(page, name):
    page.evaluate(f"window.formvis.commands.run('{name}')")
    page.wait_for_timeout(300)


def fresh(page, tool="marquee"):
    page.evaluate(f"{E}.newDocument(400, 300, 'V', 'white')")
    page.wait_for_timeout(800)
    page.evaluate(f"{E}.setTool('{tool}')")
    page.evaluate(f"{E}.zoomTo(1)")
    page.wait_for_timeout(300)


def test_no_tool_clears_the_active_tool(page):
    fresh(page)
    assert page.evaluate(f"{E}.tool") == "marquee"
    cmd(page, "no-tool")
    assert page.evaluate(f"{E}.tool") == "idle"


def test_right_to_left_layout_flips_the_document_direction_and_back(page):
    try:
        cmd(page, "interface-rtl")
        assert page.evaluate("document.documentElement.dir") == "rtl"
        cmd(page, "interface-rtl")
        assert page.evaluate("document.documentElement.dir") == "ltr"
    finally:
        page.evaluate("localStorage.removeItem('formvis.rtl')")


def test_sync_theme_with_system_follows_the_system_scheme_and_stops_when_off(page):
    try:
        page.emulate_media(color_scheme="light")
        cmd(page, "theme-sync-system")
        assert page.evaluate("document.documentElement.getAttribute('data-theme')") == "light"
        page.emulate_media(color_scheme="dark")
        page.wait_for_timeout(400)
        assert page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark"
        cmd(page, "theme-sync-system")
        assert page.evaluate("localStorage.getItem('formvis.themeSync')") == "0"
        page.emulate_media(color_scheme="light")
        page.wait_for_timeout(400)
        assert page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark"
    finally:
        page.evaluate("localStorage.removeItem('formvis.themeSync'); localStorage.removeItem('formvis.theme')")


def test_search_palette_finds_a_command_by_words_and_enter_runs_it(page):
    fresh(page)
    page.keyboard.press("Control+k")
    page.wait_for_timeout(400)
    page.keyboard.type("grid settings")
    page.wait_for_timeout(300)
    rows = page.evaluate("[...document.querySelectorAll('.cv-palette-row')].map((x) => x.textContent)")
    assert rows and rows[0].startswith("Grid Settings")
    page.keyboard.press("Enter")
    page.wait_for_timeout(500)
    assert "Preferences" in page.locator(DLG).first.inner_text()


def test_console_dialog_opens_from_its_command(page):
    cmd(page, "console-log")
    assert "Console" in page.locator(DLG).first.inner_text()
    page.keyboard.press("Escape")


def test_wheel_scrolls_and_ctrl_wheel_zooms_at_the_pointer(page):
    fresh(page)
    z0, x0, y0 = page.evaluate(VP)
    page.mouse.move(700, 450)
    page.mouse.wheel(0, 100)
    page.wait_for_timeout(300)
    z1, x1, y1 = page.evaluate(VP)
    assert z1 == z0 and y1 < y0 and x1 == x0
    page.keyboard.down("Control")
    page.mouse.wheel(0, -200)
    page.keyboard.up("Control")
    page.wait_for_timeout(300)
    assert page.evaluate(VP)[0] > z0


def test_middle_button_drag_pans_and_space_drag_pans_with_any_tool(page):
    fresh(page)
    _, x0, y0 = page.evaluate(VP)
    page.mouse.move(700, 450)
    page.mouse.down(button="middle")
    page.mouse.move(760, 480, steps=5)
    page.mouse.up(button="middle")
    page.wait_for_timeout(500)
    _, x1, y1 = page.evaluate(VP)
    assert x1 > x0 and y1 > y0
    assert page.evaluate(f"{E}.tool") == "marquee"
    page.mouse.move(700, 450)
    page.keyboard.down("Space")
    page.mouse.down()
    page.mouse.move(640, 420, steps=5)
    page.mouse.up()
    page.keyboard.up("Space")
    page.wait_for_timeout(500)
    _, x2, y2 = page.evaluate(VP)
    assert x2 < x1 and y2 < y1
    assert page.evaluate(f"{E}.tool") == "marquee"


def test_zoom_tool_click_zooms_in_and_alt_click_zooms_out(page):
    fresh(page, "zoom")
    z0 = page.evaluate(VP)[0]
    page.mouse.click(700, 450)
    page.wait_for_timeout(300)
    z1 = page.evaluate(VP)[0]
    assert z1 > z0
    page.keyboard.down("Alt")
    page.mouse.click(700, 450)
    page.keyboard.up("Alt")
    page.wait_for_timeout(300)
    assert page.evaluate(VP)[0] < z1


def test_hand_tool_drag_pans_the_view(page):
    fresh(page, "hand")
    _, x0, y0 = page.evaluate(VP)
    page.mouse.move(700, 450)
    page.mouse.down()
    page.mouse.move(650, 420, steps=5)
    page.wait_for_timeout(300)
    page.mouse.up()
    page.wait_for_timeout(300)
    _, x1, y1 = page.evaluate(VP)
    assert x1 < x0 and y1 < y0
