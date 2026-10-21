import json
import os
import urllib.request

from e2e.act_support import SCENE, dialog_open, dlg_button, set_field, start, steady

SRC = os.path.join(os.environ.get("FORMVIS_REPO", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "examples", "plugins", "formvis-sample")
ENGINE = os.environ.get("FORMVIS_E2E_ENGINE_URL", "http://127.0.0.1:" + os.environ.get("FORMVIS_E2E_ENGINE_PORT", "8190"))
BASE = ENGINE + "/api/plugins/folders/covact-sample"
IDS = "window.formvis.commands.all().map((c) => c.id).filter((i) => i.startsWith('plugin:covact-sample'))"
TOP = "[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop()"


def put(rel, text):
    urllib.request.urlopen(urllib.request.Request(f"{BASE}/{rel}", data=text.encode(), method="PUT"), timeout=10).read()


@steady
def test_a_plugin_folder_registers_filters_a_panel_tool_source_and_command_and_they_work(page, tmp_path):
    manifest = json.loads(open(os.path.join(SRC, "plugin.json")).read())
    manifest["id"] = "covact-sample"
    put("plugin.json", json.dumps(manifest))
    put("main.js", open(os.path.join(SRC, "main.js")).read())
    try:
        start(page)
        page.evaluate(SCENE)
        dialog_open(page, "manage-plugins")
        page.check(".cv-dialog input[aria-label='covact-sample on']")
        page.wait_for_function(f"{TOP}.innerText.includes('Turn on Sample Plugin?')", timeout=10000)
        dlg_button(page, "Turn On")
        page.wait_for_function(f"{IDS}.length >= 5", timeout=15000)
        assert sorted(page.evaluate(IDS)) == sorted(f"plugin:covact-sample:{k}" for k in ("filter:tint", "filter:invert-mix", "tool:probe", "source:flat", "cmd:swatch"))
        page.wait_for_function(f"{TOP}.innerText.includes('2 filters, 1 panels, 1 tools, 1 sources, 5 commands')", timeout=10000)
        page.keyboard.press("Escape")

        page.evaluate("window.formvis.commands.run('plugin:covact-sample:cmd:swatch')")
        page.wait_for_function(f"{TOP} && {TOP}.innerText.includes('Swatch')", timeout=10000)
        set_field(page, "Size", "10")
        set_field(page, "Name", "FromSwatch")
        dlg_button(page, "OK")
        page.wait_for_function("window.formvis.engine.current.doc.layers.some((l) => l.name === 'FromSwatch')", timeout=10000)
        page.wait_for_function("[...document.querySelectorAll('*')].some((e) => e.children.length === 0 && /Ex: 16 by 12, 3 layers\\. Edits seen: [1-9]/.test(e.textContent))", timeout=10000)

        page.evaluate("window.formvis.commands.run('plugin:covact-sample:filter:tint')")
        page.wait_for_function(f"{TOP} && {TOP}.innerText.includes('Sample Tint')", timeout=10000)
        assert "Amount" in page.evaluate(f"{TOP}.innerText")
    finally:
        urllib.request.urlopen(urllib.request.Request(BASE, method="DELETE"), timeout=10).read()
