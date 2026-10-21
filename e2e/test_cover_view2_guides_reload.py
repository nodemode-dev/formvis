E = "window.formvis.engine"
GUIDES = f"({E}.current.doc.guides || []).map((g) => g.axis + ':' + g.at).sort()"


def cmd(page, name):
    page.evaluate(f"window.formvis.commands.run('{name}')")
    page.wait_for_timeout(300)


def test_new_guides_from_shape_places_guides_on_the_selection_edges_and_centre(page):
    page.evaluate(f"{E}.newDocument(400, 300, 'G', 'white')")
    page.wait_for_timeout(800)
    page.evaluate(f"{E}.selectAll()")
    page.wait_for_timeout(300)
    cmd(page, "guides-from-shape")
    assert page.evaluate(GUIDES) == ["x:0", "x:400", "y:0", "y:300"]
    cmd(page, "clear-guides")
    assert page.evaluate(GUIDES) == []
    cmd(page, "guides-from-shape-centre")
    assert page.evaluate(GUIDES) == ["x:200", "y:150"]


def test_reload_window_reloads_the_page_when_nothing_is_unsaved(page):
    marker = "window.__before_reload = 1"
    page.evaluate(marker)
    with page.expect_navigation():
        page.evaluate("window.formvis.commands.run('reload-window')")
    page.wait_for_function("window.formvis && window.formvis.engine")
    assert page.evaluate("window.__before_reload") is None
