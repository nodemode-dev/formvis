# Preset Manager bundle export, import and migrate, the About dialog, and the Assistant limits, each driven through the running page.
import base64
import json

import pytest

from e2e.files2_support import steady

DLG = ".cv-scrim:not([hidden]) .cv-dialog"

HOOK = """() => {
  if (window.__hooked) { window.__got = []; return; }
  window.__hooked = true; window.__got = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const name = this.download, href = this.href;
    if (!name) return click.call(this);
    fetch(href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); window.__got.push({ name, b64: btoa(s) }); });
  };
}"""


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def prefs(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.prefs') || '{}'"))


def bundle(path, swatch, hidden):
    path.write_text(json.dumps({"format": "formvis-presets", "version": 1, "swatches": [swatch], "settings": {"shortcuts": {}, "shortcutSets": {}, "menuHidden": hidden, "menuColors": {}}}))
    return str(path)


@pytest.fixture()
def clean(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    yield
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)


def test_pc_ui_0101_and_0103_preset_manager_migrate_takes_presets_and_settings_and_import_all_takes_presets_only(page, clean, tmp_path):
    page.evaluate("window.formvis.commands.run('preset-manager')")
    page.wait_for_selector(f"{DLG} button:has-text('Migrate')")
    assert "Preset Manager" in page.locator(DLG).first.inner_text()
    with page.expect_file_chooser(timeout=15000) as chooser:
        page.locator(f"{DLG} button", has_text="Migrate").first.click()
    chooser.value.set_files(bundle(tmp_path / "a.json", "#12ab34", ["filter"]))
    page.wait_for_function("document.body.textContent.includes('1 swatches') && document.body.textContent.includes('keyboard and menu settings')", timeout=15000)
    assert prefs(page)["menuHidden"] == ["filter"]
    with page.expect_file_chooser(timeout=15000) as chooser:
        page.locator(f"{DLG} button", has_text="Import All").first.click()
    chooser.value.set_files(bundle(tmp_path / "b.json", "#34ab12", ["view"]))
    page.wait_for_function("document.body.textContent.includes('Imported 0 brushes, 1 swatches')", timeout=15000)
    assert prefs(page)["menuHidden"] == ["filter"]


@steady
def test_pc_ui_0102_and_0103_export_presets_writes_a_bundle_holding_the_imported_swatch_and_menu_choice(page, tmp_path, clean):
    page.evaluate(HOOK)
    page.evaluate("window.formvis.commands.run('preset-manager')")
    page.wait_for_selector(f"{DLG} button:has-text('Migrate')")
    with page.expect_file_chooser(timeout=15000) as chooser:
        page.locator(f"{DLG} button", has_text="Migrate").first.click()
    chooser.value.set_files(bundle(tmp_path / "a.json", "#12ab34", ["filter"]))
    page.wait_for_function("document.body.textContent.includes('keyboard and menu settings')", timeout=15000)
    page.keyboard.press("Escape")
    page.evaluate("window.__got = []")
    page.evaluate("window.formvis.commands.run('presets-export')")
    page.wait_for_function("window.__got.length > 0", timeout=20000)
    got = page.evaluate("window.__got[0]")
    out = json.loads(base64.b64decode(got["b64"]))
    assert got["name"] == "formvis-presets.json" and out["format"] == "formvis-presets"
    assert "#12ab34" in [s.lower() for s in out["swatches"]] and out["settings"]["menuHidden"] == ["filter"]


def test_sc_ai_0348_about_dialog_shows_the_app_and_engine_versions_and_the_plugin_folder(page):
    caps = page.evaluate("fetch('/api/capabilities').then((r) => r.json()).then((j) => [j.version, j.dataDir])")
    page.evaluate("window.formvis.commands.run('about')")
    page.wait_for_selector(f"{DLG} .cv-welcome-title")
    text = page.locator(DLG).first.inner_text()
    assert "About FormVis" in text and f"Engine {caps[0]}" in text and f"Plugin folder: {caps[1].rstrip('/')}/plugins" in text
    assert "Apache License 2.0" in text
    page.keyboard.press("Escape")


def test_sc_ai_0109_assistant_limits_are_clamped_kept_and_shown_again_after_a_reload(page):
    page.evaluate("localStorage.removeItem('formvis.assistant')")
    try:
        page.evaluate("window.formvis.commands.run('assistant')")
        page.locator(".cv-assistant-settings summary").first.click()
        kept = page.locator("input[aria-label='Chats kept']").first
        calls = page.locator("input[aria-label='Tool calls a turn']").first
        kept.fill("7")
        kept.press("Tab")
        calls.fill("999")
        calls.press("Tab")
        page.wait_for_timeout(300)
        assert kept.input_value() == "7" and calls.input_value() == "100"
        saved = json.loads(page.evaluate("localStorage.getItem('formvis.assistant')"))
        assert saved["chatsKept"] == 7 and saved["maxCalls"] == 100
        reload(page)
        page.evaluate("window.formvis.commands.run('assistant')")
        page.locator(".cv-assistant-settings summary").first.click()
        assert page.locator("input[aria-label='Chats kept']").first.input_value() == "7"
        assert page.locator("input[aria-label='Tool calls a turn']").first.input_value() == "100"
    finally:
        page.evaluate("localStorage.removeItem('formvis.assistant')")


def test_pc_ui_0108_and_0957_menus_dialog_hides_an_item_and_colours_another_in_the_menu_bar(page, clean):
    page.evaluate("window.formvis.commands.run('edit-menus')")
    menu = page.locator(f"{DLG} select[aria-label='Menu']").first
    menu.wait_for()
    menu.select_option("Image")
    page.locator(f"{DLG} .cv-list-row", has_text="Image Size").first.locator("input[data-role='shown']").uncheck()
    page.locator(f"{DLG} .cv-list-row", has_text="Canvas Size").first.locator("select[data-role='color']").select_option("red")
    page.wait_for_timeout(300)
    p = prefs(page)
    assert p["menuHidden"] == ["image-size"] and p["menuColors"] == {"canvas-size": "red"}
    page.keyboard.press("Escape")
    page.evaluate("window.formvis.engine.newDocument(40, 30, 'Menus', 'white')")
    page.locator(".cv-menubar >> text=Image").first.click()
    page.wait_for_selector(".cv-menu-item[data-color='red']")
    items = page.evaluate("[...document.querySelectorAll('.cv-menu-item')].map((e) => e.textContent.trim())")
    assert not any(t.startswith("Image Size") for t in items)
    assert any(t.startswith("Canvas Size") for t in items)
    page.keyboard.press("Escape")
    page.evaluate("window.formvis.commands.run('edit-menus')")
    page.locator(f"{DLG} button", has_text="Show All").first.click()
    page.locator(f"{DLG} button", has_text="Clear Colors").first.click()
    page.wait_for_timeout(300)
    p = prefs(page)
    assert p["menuHidden"] == [] and p["menuColors"] == {}
