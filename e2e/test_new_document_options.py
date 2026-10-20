DLG = ".cv-scrim:not([hidden]) .cv-newdoc"
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def open_dialog(page):
    page.evaluate("window.formvis.commands.run('new')")
    page.wait_for_selector(DLG)
    d = page.locator(DLG)
    d.locator("input[aria-label='Width']").fill("64")
    d.locator("input[aria-label='Width']").press("Tab")
    d.locator("select[aria-label='Unit']").select_option("px")
    return d


def make(page, d):
    d.locator(".cv-dialog-foot button", has_text="Create").click()
    page.wait_for_selector(DLG, state="detached")


def test_background_offers_the_five_choices_and_defaults_to_white(page):
    d = open_dialog(page)
    sel = d.locator("select[aria-label='Background Contents']")
    assert sel.input_value() == "white"
    assert sel.locator("option").evaluate_all("o => o.map(x => x.value)") == ["white", "background", "black", "custom", "transparent"]
    make(page, d)
    assert page.evaluate(PX, [10, 10]) == [255, 255, 255, 255]


def test_black_background(page):
    d = open_dialog(page)
    d.locator("select[aria-label='Background Contents']").select_option("black")
    make(page, d)
    assert page.evaluate(PX, [10, 10]) == [0, 0, 0, 255]


def test_custom_background_uses_the_hex_colour(page):
    d = open_dialog(page)
    d.locator("select[aria-label='Background Contents']").select_option("custom")
    d.locator("input[aria-label='Custom background colour']").fill("#336699")
    make(page, d)
    assert page.evaluate(PX, [10, 10]) == [0x33, 0x66, 0x99, 255]


def test_transparent_is_unchanged(page):
    d = open_dialog(page)
    d.locator("select[aria-label='Background Contents']").select_option("transparent")
    make(page, d)
    assert page.evaluate(PX, [10, 10])[3] == 0


def test_the_colour_field_keeps_its_space_when_switching(page):
    d = open_dialog(page)
    sel = d.locator("select[aria-label='Background Contents']")
    box = "(() => { const s = document.querySelector('.cv-newdoc [aria-label=\"Background Contents\"]'); const c = document.querySelector('.cv-newdoc .cv-nd-colour'); const a = s.closest('.cv-nd-row').getBoundingClientRect(), b = c.getBoundingClientRect(); return [Math.round(a.width), Math.round(a.height), Math.round(b.width), Math.round(b.height)]; })()"
    before = page.evaluate(box)
    sel.select_option("custom")
    assert page.evaluate(box) == before
    sel.select_option("white")
    assert page.evaluate(box) == before
    page.keyboard.press("Escape")


def test_cmyk_and_lab_are_not_offered_at_32_bits(page):
    d = open_dialog(page)
    mode, depth = d.locator("select[aria-label='Color Mode']"), d.locator("select[aria-label='Bit depth']")
    for m in ("cmyk", "lab"):
        mode.select_option(m)
        assert depth.locator("option").evaluate_all("o => o.map(x => x.value)") == ["8", "16"]
    mode.select_option("rgb")
    assert depth.locator("option").evaluate_all("o => o.map(x => x.value)") == ["8", "16", "32"]
    page.keyboard.press("Escape")
