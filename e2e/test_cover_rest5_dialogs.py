PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
OPEN = "async (c) => { await window.formvis.commands.run(c); }"
DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"


def two_coloured_documents(page):
    for name, rgb in (("Red", (255, 0, 0)), ("Blue", (0, 0, 255))):
        page.evaluate("""([n, rgb]) => { const e = window.formvis.engine; e.newDocument(30, 20, n, 'white'); e.fg = { r: rgb[0], g: rgb[1], b: rgb[2] }; e.selectAll(); e.fill('fg'); e.deselect ? e.deselect() : 0; }""", [name, rgb])
        page.wait_for_timeout(300)


def press(page, text):
    page.locator(f"{DIALOG}-foot button", has_text=text).last.click()
    page.wait_for_timeout(600)


def test_slices_lock_blocks_delete_and_clear_then_unlock_deletes_one_and_clear_removes_the_rest(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'S', 'white')")
    assert page.evaluate("[window.formvis.engine.addSlice({ x: 0, y: 0, w: 30, h: 20 }), window.formvis.engine.addSlice({ x: 30, y: 20, w: 20, h: 10 })]") == [True, True]
    n = "window.formvis.engine.current.doc.slices.length"
    assert page.evaluate(n) == 2
    page.evaluate(OPEN, "lock-slices")
    assert page.evaluate("window.formvis.engine.view.slicesLocked") is True
    assert page.evaluate("window.formvis.commands.run('delete-slice')") is False
    assert page.evaluate("window.formvis.commands.run('clear-slices')") is False
    assert page.evaluate(n) == 2
    page.evaluate(OPEN, "lock-slices")
    assert page.evaluate("window.formvis.engine.view.slicesLocked") is False
    page.evaluate("() => { const e = window.formvis.engine; e.activeSlice = e.current.doc.slices[0].id; }")
    assert page.evaluate("window.formvis.commands.run('delete-slice')") is True
    assert page.evaluate(n) == 1
    page.evaluate(OPEN, "clear-slices")
    assert page.evaluate(n) == 0


def test_load_files_into_stack_takes_the_open_documents_and_makes_one_document_with_a_layer_each(page):
    two_coloured_documents(page)
    before = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate(OPEN, "load-files-stack")
    page.locator(f"{DIALOG} button", has_text="Open documents").last.click()
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')?.innerText.includes('Red.png')", timeout=8000)
    assert page.locator(f"{DIALOG} label", has_text="Attempt to Automatically Align Source Images").count() == 1
    assert page.locator(f"{DIALOG} button", has_text="Folder...").count() == 1
    press(page, "OK")
    page.wait_for_function(f"window.formvis.engine.projects.length === {before + 1}", timeout=15000)
    names = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)")
    assert len(names) >= 2 and any("Red" in n for n in names) and any("Blue" in n for n in names)


def test_statistics_with_open_documents_and_maximum_builds_a_stack_that_keeps_the_brightest_channels(page):
    two_coloured_documents(page)
    before = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate(OPEN, "stack-statistics")
    page.locator(f"{DIALOG} button", has_text="Open documents").last.click()
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')?.innerText.includes('Blue.png')", timeout=8000)
    page.locator(f"{DIALOG} select").last.select_option("maximum", force=True)
    press(page, "OK")
    page.wait_for_function(f"window.formvis.engine.projects.length === {before + 1}", timeout=15000)
    page.wait_for_timeout(1500)
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") >= 1
    assert page.evaluate(PX, [10, 10])[:3] == [255, 0, 255]


def test_blending_options_show_the_group_and_shape_switches_and_keep_them_after_ok(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'B', 'white')")
    labels = ["Blend Interior Effects as Group", "Blend Clipped Layers as Group", "Transparency Shapes Layer", "Layer Mask Hides Effects"]

    def box(label):
        return page.locator(f'{DIALOG} label:has-text("{label}") input').first

    page.evaluate(OPEN, "style-blending")
    page.locator(f"{DIALOG}-foot").last.wait_for()
    page.wait_for_timeout(1000)
    assert box(labels[3]).is_checked()
    states = [box(l).is_checked() for l in labels[:3]]
    assert states == [False, False, True]
    box(labels[0]).check()
    box(labels[1]).check()
    box(labels[2]).uncheck()
    box(labels[3]).uncheck()
    box("Drop Shadow").check()
    press(page, "OK")
    page.evaluate(OPEN, "style-blending")
    page.locator(f"{DIALOG}-foot").last.wait_for()
    page.wait_for_timeout(1000)
    assert [box(l).is_checked() for l in labels] == [True, True, False, False]
    press(page, "Cancel")
