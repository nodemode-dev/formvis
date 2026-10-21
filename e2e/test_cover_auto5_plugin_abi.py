import urllib.request

from e2e.files2_support import SCENE, start

SRC = """formvis.register({ name: 'Abi', commands: [
  { id: 'steps', label: 'Abi Steps', run: async () => { let done = 0; for (let i = 1; i <= 50; i++) { const go = await formvis.progress(i, 50); if (!go) break; await new Promise((r) => setTimeout(r, 100)); done = i; } await formvis.call('add_layer', { name: 'steps:' + done + ':' + formvis.cancelled() }); } },
  { id: 'panel', label: 'Abi Panel', run: async () => { formvis.panel({ id: 'abi', label: 'AbiPanel', html: '<p>hi</p>', height: 80, onMessage: () => {} }); } },
]});"""


def test_a_plugin_shows_progress_stops_on_escape_and_adds_a_dock_panel(page, tmp_path):
    f = tmp_path / "Abi.js"
    f.write_text(SRC)
    try:
        start(page)
        page.evaluate(SCENE)
        page.evaluate("window.formvis.commands.run('manage-plugins')")
        page.set_input_files(".cv-dialog input[type=file][aria-label='Plugin file']", str(f))
        page.get_by_role("button", name="Add", exact=True).click()
        page.wait_for_function("!!window.formvis.commands.get('plugin:Abi.js:steps')", timeout=15000)
        page.keyboard.press("Escape")
        page.evaluate("window.formvis.commands.run('plugin:Abi.js:steps')")
        page.wait_for_selector(".cv-run-bar", state="attached", timeout=10000)
        page.wait_for_timeout(800)
        page.keyboard.press("Escape")
        page.wait_for_function("window.formvis.engine.current.doc.layers.some((l) => /^steps:\\d+:true$/.test(l.name))", timeout=15000)
        done = int(page.evaluate("window.formvis.engine.current.doc.layers.find((l) => l.name.startsWith('steps:')).name").split(":")[1])
        assert 0 < done < 50
        page.evaluate("window.formvis.commands.run('plugin:Abi.js:panel')")
        page.wait_for_function("document.body.innerText.includes('AbiPanel')", timeout=10000)
    finally:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/plugins/Abi.js", method="DELETE"), timeout=10).read()
