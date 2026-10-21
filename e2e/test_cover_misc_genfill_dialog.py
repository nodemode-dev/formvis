# Generative Fill dialog: the prompt's own undo and redo, the seed number and the Crop and stitch settings with their
# presets. Nothing is generated: no provider is called.
SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(120, 80, 'Poster', { r: 200, g: 100, b: 50 });
  e.applySelection(E.SelectionMask.cropped(20, 20, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }"""
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def open_dialog(page):
    page.evaluate(SETUP)
    page.evaluate("window.formvis.commands.run('generative-fill')")
    page.locator(DLG, has_text="Generative Fill").wait_for(timeout=10000)
    return page.locator(DLG, has_text="Generative Fill")


def test_seed_number_keeps_the_value_typed(page):
    d = open_dialog(page)
    d.locator("select[aria-label='Seed']").select_option("fixed")
    num = d.get_by_label("Seed number")
    num.fill("1234")
    num.press("Tab")
    assert num.input_value() == "1234"


def test_crop_and_stitch_fields_take_values_and_the_preset_list_changes_them(page):
    d = open_dialog(page)
    d.locator("details.cv-cs > summary").click()
    pad = d.get_by_label("Crop padding")
    assert pad.input_value() == "64"
    pad.fill("32")
    pad.press("Tab")
    assert pad.input_value() == "32"
    sel = d.locator("select[aria-label='Crop and stitch preset']")
    options = sel.locator("option").evaluate_all("(o) => o.map((x) => x.value)")
    other = next(v for v in options if v not in ("custom", "Custom", sel.input_value()))
    sel.select_option(other)
    after = [d.get_by_label(n).input_value() for n in ("Crop padding", "Crop context factor", "Crop target size", "Stitch feather")]
    assert after != ["32", "1", "1024", "16"]
