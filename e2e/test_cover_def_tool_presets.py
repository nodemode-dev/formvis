# Window > Tool Presets: a preset keeps one tool's option values; Apply writes them back; rename and delete work.
import json

DIAMETER = "window.formvis.engine.brush.diameter"


def dlg(page, title):
    return page.locator(".cv-dialog:visible", has_text=title).last


def stored(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.toolPresets') || '[]'"))


def name_prompt(page, title, value, ok):
    d = dlg(page, title)
    d.wait_for(timeout=5000)
    d.locator("input[type=text]").fill(value)
    d.get_by_role("button", name=ok, exact=True).click()


def test_save_apply_rename_and_delete_a_brush_preset(page):
    page.evaluate("window.formvis.engine.newDocument(200, 150, 'P', 'white'); window.formvis.engine.setTool('brush'); window.formvis.engine.brush = { ...window.formvis.engine.brush, diameter: 23 }")
    page.evaluate("window.formvis.commands.run('tool-presets')")
    d = dlg(page, "Tool Presets")
    d.wait_for(timeout=5000)
    assert d.locator("select option").count() == 0

    d.get_by_role("button", name="New Preset...").click()
    name_prompt(page, "New Tool Preset", "Thin", "OK")
    d.locator("select option").first.wait_for(timeout=5000)
    saved = stored(page)
    assert [p["name"] for p in saved] == ["Thin"] and saved[0]["tool"] == "brush"

    page.evaluate("window.formvis.engine.brush = { ...window.formvis.engine.brush, diameter: 77 }")
    assert page.evaluate(DIAMETER) == 77
    d.locator("select option").first.click()
    d.get_by_role("button", name="Apply", exact=True).click()
    page.wait_for_function(f"{DIAMETER} === 23", timeout=5000)

    d.locator("select option").first.click()
    d.get_by_role("button", name="Rename...").click()
    name_prompt(page, "Rename Tool Preset", "Fine", "Rename")
    page.wait_for_function("JSON.parse(localStorage.getItem('formvis.toolPresets') || '[]').map(p => p.name).join() === 'Fine'", timeout=5000)

    d.locator("select option").first.click()
    d.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('formvis.toolPresets') || '[]').length === 0", timeout=5000)
    assert d.locator("select option").count() == 0
