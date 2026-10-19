DLG = ".cv-scrim:not([hidden]) .cv-dialog"
ACTIVE = "(() => { const l = window.formvis.engine.current.activeLayer; return [l.name, l.blend, Math.round(l.opacity * 100)]; })()"


def test_new_layer_dialog_from_its_shortcut(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'L', 'white')")
    page.locator(".cv-stage").click()
    page.keyboard.press("Shift+Control+N")
    dlg = page.locator(DLG)
    assert dlg.locator(".cv-dialog-title").inner_text().strip() == "New Layer"
    assert dlg.locator("p.cv-note", has_text="Mode-Neutral Color").is_visible()
    assert dlg.locator(".cv-field", has_text="Name").locator("input").input_value() == "Layer 1"
    dlg.locator(".cv-field", has_text="Name").locator("input").fill("Sky")
    dlg.locator(".cv-field", has_text="Mode").locator("select").select_option("multiply")
    num = dlg.locator(".cv-field", has_text="Opacity").locator("input.cv-num")
    num.fill("40"); num.press("Tab")
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    assert page.evaluate(ACTIVE) == ["Sky", "multiply", 40]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "New Layer"
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1


def test_duplicate_layer_dialog_names_the_copy_and_ctrl_j_stays_quick(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'L', 'white')")
    assert page.evaluate("window.formvis.commands.run('duplicate-dialog')") is True
    dlg = page.locator(DLG)
    assert dlg.locator("select[aria-label='Document']").input_value() == ""   # the default destination is this document
    assert dlg.locator(".cv-field", has_text="As").locator("input").input_value() == "Background copy"
    dlg.locator(".cv-field", has_text="As").locator("input").fill("Backup")
    dlg.locator(".cv-field", has_text="As").locator("input").press("Enter")
    assert page.evaluate(ACTIVE)[0] == "Backup"
    page.locator(".cv-stage").click()
    page.keyboard.press("Control+J")
    assert page.evaluate(ACTIVE)[0] == "Backup copy"
    assert page.evaluate("document.querySelectorAll('.cv-scrim:not([hidden])').length") == 0


def test_new_layer_can_clip_to_the_layer_below(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'L', 'white')")
    base = page.evaluate("window.formvis.engine.current.activeLayer.id")
    assert page.evaluate("window.formvis.commands.run('new-layer-dialog')") is True
    dlg = page.locator(DLG)
    dlg.locator(".cv-field", has_text="Use Previous Layer").locator("input").check()
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    assert page.evaluate("window.formvis.engine.current.activeLayer.clipId") == base


def test_new_group_dialog_names_the_folder(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'L', 'white')")
    assert page.evaluate("window.formvis.commands.run('new-folder-dialog')") is True
    dlg = page.locator(DLG)
    assert dlg.locator(".cv-dialog-title").inner_text().strip() == "New Group"
    assert dlg.locator("p.cv-note", has_text="Mode and Opacity").is_visible()
    assert dlg.locator(".cv-field", has_text="Name").locator("input").input_value() == "Folder 1"
    dlg.locator(".cv-field", has_text="Name").locator("input").fill("Clouds")
    dlg.locator(".cv-field", has_text="Name").locator("input").press("Enter")
    got = page.evaluate("(() => { const l = window.formvis.engine.current.activeLayer; return [l.name, l.isGroup]; })()")
    assert got == ["Clouds", True], got
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1
