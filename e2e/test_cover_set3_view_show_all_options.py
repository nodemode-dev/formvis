import json

COUNT = """(() => { const c = document.querySelector('.cv-overlay-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"""
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
VIEW = "(() => { const v = window.formvis.engine.view; return [v.guides, v.grid, v.slices]; })()"
LABELS = ["Notes", "Count", "Selection Edges", "Layer Edges", "Target Path", "Brush Preview", "Mesh", "Edit Pins"]


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def extras(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.viewExtras') || '{}'"))


def run(page, cmd):
    page.evaluate(f"window.formvis.commands.run('{cmd}')")
    page.wait_for_timeout(400)


def new_doc(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'X', 'white')")
    page.wait_for_timeout(1000)


def marquee(page):
    box = page.locator(".cv-stage").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.keyboard.press("m")
    page.wait_for_timeout(200)
    page.mouse.move(cx - 60, cy - 40)
    page.mouse.down()
    page.mouse.move(cx, cy, steps=5)
    page.mouse.move(cx + 60, cy + 40, steps=5)
    page.mouse.up()
    page.wait_for_timeout(600)


def clean(page):
    page.evaluate("localStorage.removeItem('formvis.viewExtras')")
    reload(page)


def test_show_all_turns_on_every_extra_guides_grid_and_slices_and_show_none_turns_them_off(page):
    clean(page)
    try:
        new_doc(page)
        run(page, "show-no-extras")
        assert page.evaluate(VIEW) == [False, False, False]
        assert not any(v for k, v in extras(page).items() if k != "master")
        run(page, "show-all-extras")
        assert page.evaluate(VIEW) == [True, True, True]
        saved = extras(page)
        assert all(saved[k] for k in ["notes", "counts", "selectionEdges", "layerEdges", "targetPath", "brushPreview", "mesh", "pins"])
        reload(page)
        assert all(extras(page)[k] for k in ["notes", "counts", "selectionEdges", "layerEdges"])
        run(page, "show-no-extras")
        assert page.evaluate(VIEW) == [False, False, False]
    finally:
        clean(page)


def test_show_extras_options_lists_the_eight_helpers_and_each_box_switches_its_own_extra(page):
    clean(page)
    try:
        new_doc(page)
        run(page, "show-all-extras")
        run(page, "show-extras-options")
        names = [t.strip() for t in page.locator(f"{DLG} label").all_inner_texts()]
        assert names == LABELS
        assert all(c.is_checked() for c in page.locator(f"{DLG} input[type=checkbox]").all())
        page.locator(f"{DLG} label", has_text="Count").locator("input").click()
        page.wait_for_timeout(300)
        saved = extras(page)
        assert saved["counts"] is False and saved["notes"] is True and saved["selectionEdges"] is True
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        reload(page)
        assert extras(page)["counts"] is False
        run(page, "show-extras-options")
        checks = {t.strip(): c.is_checked() for t, c in zip(page.locator(f"{DLG} label").all_inner_texts(), page.locator(f"{DLG} input[type=checkbox]").all())}
        assert checks["Count"] is False and checks["Notes"] is True
        page.keyboard.press("Escape")
    finally:
        clean(page)


def test_the_selection_edges_box_in_show_extras_options_removes_and_restores_the_marching_ants(page):
    clean(page)
    try:
        new_doc(page)
        marquee(page)
        assert page.evaluate(COUNT) > 0
        run(page, "show-extras-options")
        page.locator(f"{DLG} label", has_text="Selection Edges").locator("input").click()
        page.wait_for_timeout(500)
        assert page.evaluate(COUNT) == 0
        page.locator(f"{DLG} label", has_text="Selection Edges").locator("input").click()
        page.wait_for_timeout(500)
        assert page.evaluate(COUNT) > 0
        page.keyboard.press("Escape")
    finally:
        clean(page)
