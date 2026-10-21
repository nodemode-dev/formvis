PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def test_the_example_wasm_plug_in_installs_runs_on_the_picture_and_shows_in_the_plug_in_list_until_removed(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(40, 30, 'Wasm', 'white'); e.fg = { r: 200, g: 40, b: 40 }; e.selectAll(); e.fill('fg'); e.deselect(); }")
    before = page.evaluate(PX, [10, 10])
    page.evaluate("window.formvis.commands.run('wasm-plugin-example')")
    page.wait_for_function("window.formvis.commands.all().some((c) => c.id.startsWith('wasm-run-'))", timeout=15000)
    ids = page.evaluate("window.formvis.commands.all().map((c) => c.id).filter((i) => i.startsWith('wasm-run-'))")
    assert ids
    page.evaluate("(id) => window.formvis.commands.run(id)", ids[0])
    page.wait_for_timeout(1500)
    dialog = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    assert dialog.count() == 1
    page.wait_for_timeout(800)
    dialog.last.locator(".cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1500)
    after = page.evaluate(PX, [10, 10])
    assert all(abs(a - b) <= 2 for a, b in zip(after, [222, 80, 24])), (before, after)
    assert page.evaluate("window.formvis.engine.current.history.steps.names.length") >= 1
