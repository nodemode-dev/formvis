# Plugins (1.52.6): a plugin added through Manage Plugins, its commands run, the sandbox held, off and removed.
import urllib.request

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
PLUGIN = """formvis.register({ name: 'Invert Red', commands: [
  { id: 'invert', label: 'Invert Red', run: async () => { const img = await formvis.getPixels(); for (let i = 0; i < img.data.length; i += 4) img.data[i] = 255 - img.data[i]; await formvis.putPixels(img, 'replace'); } },
  { id: 'layer', label: 'Add Plugin Layer', run: async () => { await formvis.call('add_layer', { name: 'From plugin' }); } },
  { id: 'escape', label: 'Try Escape', run: async () => {
      const tries = [];
      try { tries.push(parent.formvis ? 'reached' : 'none'); } catch (e) { tries.push('blocked'); }
      try { localStorage.getItem('formvis.prefs'); tries.push('storage'); } catch (e) { tries.push('blocked'); }
      await formvis.call('add_layer', { name: 'escape:' + tries.join(',') }); } },
]});"""


def test_a_plugin_is_added_runs_in_its_sandbox_and_goes(page, tmp_path):
    f = tmp_path / "Invert Red.js"; f.write_text(PLUGIN)
    page.evaluate("window.formvis.engine.newDocument(40, 30, 'P', 'white')")
    page.evaluate("window.formvis.commands.run('manage-plugins')")
    page.locator(DLG, has_text="Plugins").wait_for()
    page.locator(f"{DLG} input[type=file][aria-label='Plugin file']").set_input_files(str(f))
    confirm = page.locator(DLG, has_text="Add Invert Red.js?")
    assert "cannot see your keys or files" in confirm.inner_text()
    confirm.get_by_role("button", name="Add", exact=True).click()
    page.wait_for_function("() => !!window.formvis.commands.get('plugin:Invert Red.js:invert')", timeout=15000)
    page.keyboard.press("Escape")
    run = lambda cmd: page.evaluate(f"window.formvis.commands.run('plugin:Invert Red.js:{cmd}')")
    run("invert")
    page.wait_for_function("() => window.formvis.engine.activeLayer.raster.ctx.getImageData(5, 5, 1, 1).data[0] === 0", timeout=10000)
    assert page.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(5, 5, 1, 1).data)") == [0, 255, 255, 255]
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(5, 5, 1, 1).data)") == [255, 255, 255, 255]   # one step
    run("layer")
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'From plugin')", timeout=10000)
    run("escape")
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name.startsWith('escape:'))", timeout=10000)
    assert page.evaluate("window.formvis.engine.current.doc.layers.find((l) => l.name.startsWith('escape:')).name") == "escape:blocked,blocked"   # the sandbox held
    page.evaluate("window.formvis.commands.run('manage-plugins')")
    page.locator(f"{DLG} input[aria-label='Invert Red.js on']").uncheck()
    assert page.evaluate("window.formvis.commands.get('plugin:Invert Red.js:invert')") is None             # off: its commands gone
    page.locator(f"{DLG} .cv-plugins-row button", has_text="Remove").click()
    page.locator(f"{DLG} .cv-plugins-list", has_text="No plugins yet.").wait_for()
    assert urllib.request.urlopen("http://127.0.0.1:8190/api/plugins", timeout=10).read() == b"[]"
