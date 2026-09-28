def test_a_repeated_notice_is_shown_once(page):
    # Operation with no subpath chosen gives a notice; asking again keeps one notice rather than stacking copies.
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(100, 100, 'N', 'white'); const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }); e.setWorkPath({ subpaths: [{ closed: true, anchors: [c(10, 10), c(50, 10), c(50, 50)] }] }); e.setTool('pathSelect'); })()")
    bar = page.locator(".cv-opt-group:not([hidden])")
    for name in ("Subtract", "Exclude", "Intersect"):
        bar.get_by_role("button", name=name, exact=True).click()
    texts = page.evaluate("[...document.querySelectorAll('#toast-root .cv-toast')].map((n) => n.textContent)")
    assert texts == ["Choose a path with the Path Selection tool first."], texts
    page.evaluate("window.formvis.engine.notice('Something else.')")
    assert page.evaluate("document.querySelectorAll('#toast-root .cv-toast').length") == 2
