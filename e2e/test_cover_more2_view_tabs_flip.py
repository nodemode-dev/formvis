def test_reopen_closed_tab_brings_the_closed_document_back(page):
    page.evaluate("window.formvis.engine.newDocument(30, 20, 'ToClose', 'white')")
    names = lambda: page.evaluate("window.formvis.engine.projects.map((p) => p.name)")
    assert "ToClose" in names()
    page.evaluate("window.formvis.commands.run('close-document')")
    page.wait_for_function("!window.formvis.engine.projects.some((p) => p.name === 'ToClose')", timeout=10000)
    page.evaluate("window.formvis.commands.run('reopen-closed-tab')")
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.name === 'ToClose'", timeout=15000)
    assert page.evaluate("(() => { const c = window.formvis.engine.flattened(); return [c.width, c.height]; })()") == [30, 20]


def test_flip_view_mirrors_the_view_and_flips_back(page):
    page.evaluate("window.formvis.engine.newDocument(40, 40, 'F', 'white')")
    assert not page.evaluate("window.formvis.engine.current.viewport.flipped")
    page.evaluate("window.formvis.commands.run('flip-view-h')")
    assert page.evaluate("window.formvis.engine.current.viewport.flipped") is True
    page.evaluate("window.formvis.commands.run('flip-view-h')")
    assert not page.evaluate("window.formvis.engine.current.viewport.flipped")
