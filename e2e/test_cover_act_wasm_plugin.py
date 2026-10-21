from e2e.act_support import SCENE, dialog_open, dlg_button, px, set_field, start, steady

HAS = "!!window.formvis.commands.get('wasm-run-tint-mix')"
TOP = "[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop()"


@steady
def test_the_example_wasm_plugin_installs_runs_from_its_generated_dialog_persists_and_is_removed(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    dialog_open(page, "wasm-plugins")
    assert "No WebAssembly plug-ins yet." in page.evaluate(f"{TOP}.innerText")
    dlg_button(page, "Install Example")
    page.wait_for_function(HAS, timeout=15000)
    assert "Tint Mix 1.0.0" in page.evaluate(f"{TOP}.innerText")

    page.evaluate(f"{TOP}.querySelector('[data-act=run]').click()")
    page.wait_for_function(f"{TOP}.innerText.includes('Leave transparent pixels alone')", timeout=10000)
    labels = page.evaluate(f"[...{TOP}.querySelectorAll('.cv-field > span')].map((s) => s.textContent.trim())")
    assert ["Mode", "Amount (%)", "Red", "Green", "Blue", "Leave transparent pixels alone"] == [x for x in labels if x in ("Mode", "Amount (%)", "Red", "Green", "Blue", "Leave transparent pixels alone")]
    set_field(page, "Mode", "mix")
    set_field(page, "Amount (%)", "100")
    set_field(page, "Red", "0")
    set_field(page, "Green", "255")
    set_field(page, "Blue", "0")
    page.wait_for_timeout(800)
    dlg_button(page, "OK")
    page.wait_for_function("window.formvis.engine.activeLayer.raster.ctx.getImageData(12, 8, 1, 1).data[1] === 255", timeout=15000)
    assert px(page, 12, 8) == [0, 255, 0] and px(page, 3, 8) == [220, 30, 30]
    page.evaluate("window.formvis.commands.run('undo')")
    page.wait_for_function("window.formvis.engine.activeLayer.raster.ctx.getImageData(12, 8, 1, 1).data[1] === 40", timeout=10000)
    assert px(page, 12, 8) == [30, 40, 220]

    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine", timeout=90000)
    page.wait_for_function(HAS, timeout=20000)
    dialog_open(page, "wasm-plugins")
    page.evaluate(f"{TOP}.querySelector('[data-act=remove]').click()")
    page.wait_for_function(f"!({HAS})", timeout=10000)
    assert "No WebAssembly plug-ins yet." in page.evaluate(f"{TOP}.innerText")
