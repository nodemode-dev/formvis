OBSERVE = """() => { window.__shift = 0; window.__entries = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__shift += e.value; window.__entries.push(e.sources?.map((s) => s.node?.className).join(' ')); } })
    .observe({ type: 'layout-shift', buffered: false }); }"""


def settle(page):
    page.wait_for_timeout(700)


def test_documents_opening_and_closing_do_not_jump_the_tab_bar(page):
    # A document can open with no click just before it (a drop, an import finishing); the tabs and the new-document
    # button then slide into place, which browsers do not count as a layout shift (1.41.0; it counted before).
    page.evaluate(OBSERVE)
    for name in ["One", "Two", "Three"]:
        page.evaluate(f"window.formvis.engine.newDocument(80, 60, '{name}', 'white')")
        settle(page)
    page.evaluate("window.formvis.engine.closeProject ? window.formvis.engine.closeProject(window.formvis.engine.current.id) : null")
    settle(page)
    got = page.evaluate("({ shift: window.__shift, entries: window.__entries })")
    assert got["shift"] == 0, got


def test_layers_arriving_do_not_jump_the_layers_panel(page):
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'L', 'white'); window.formvis.engine.addLayer()")
    settle(page)
    page.evaluate(OBSERVE)
    for _ in range(3):
        page.evaluate("window.formvis.engine.addLayer()")
        settle(page)
    got = page.evaluate("({ shift: window.__shift, entries: window.__entries })")
    assert got["shift"] == 0, got                                        # 0.0036 before 1.38.0
