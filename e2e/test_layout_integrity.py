# The owner's walkthrough of 1.48.0: no gap above the columns, no panel over another, nothing hidden under the open side
# column, toasts never over the panels, and the Layers header holding only its tabs and menus.
BOX = "(s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; }"


def test_the_columns_reach_the_title_bar_and_nothing_overlaps(page):
    page.evaluate("window.formvis.engine.newDocument(1920, 1080, 'L', 'white'); window.formvis.commands.run('panel-timeline'); window.formvis.commands.run('panel-history')")
    page.wait_for_timeout(300)
    title = page.evaluate(BOX, ".cv-titlebar")
    assert page.evaluate(BOX, ".cv-props-col")["t"] == title["b"] and page.evaluate(BOX, ".cv-layers")["t"] == title["b"]
    sections = page.evaluate("[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden).map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })")
    assert all(b[0] >= a[1] - 1 for a, b in zip(sections, sections[1:])), sections                     # stacked, not overlapping
    assert page.evaluate(BOX, ".cv-options")["r"] <= page.evaluate(BOX, ".cv-props-col")["l"] + 1           # nothing under the column
    assert page.locator(".cv-layers-panel > .cv-panel-head [data-cmd='new-folder']").count() == 0
    assert page.locator(".cv-layers-page > .cv-panel-foot [data-cmd='new-folder']").count() == 1           # the Layers page's footer (1.49.2)
    page.evaluate("window.formvis.commands.run('panel-timeline'); window.formvis.commands.run('panel-history')")


def test_toasts_stay_off_the_panels(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'T', 'white'); window.formvis.engine.notice('A notice to place')")
    toast = page.locator(".cv-toast", has_text="A notice to place")
    toast.wait_for()
    t, dock = toast.bounding_box(), page.evaluate(BOX, ".cv-layers")
    assert t["x"] + t["width"] <= dock["l"], (t, dock)


def test_the_color_tab_paints_after_being_shown_minimised(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'C', 'white')")
    page.locator(".cv-swatches .cv-group-min").click()                                                    # minimised
    page.locator(".cv-swatches .cv-group-tab", has_text="Color").click()
    page.locator(".cv-swatches .cv-group-min").click()                                                    # shown again
    page.wait_for_timeout(300)
    lit = page.evaluate("(() => { const c = document.querySelector('.cv-color-sv'), d = c.getContext('2d').getImageData(Math.floor(c.width * 0.9), 2, 1, 1).data; return d[3]; })()")
    assert lit == 255                                                                                      # painted, not blank
    page.locator(".cv-swatches .cv-group-tab", has_text="Swatches").click()


def test_a_fitted_document_stays_clear_of_the_open_column_and_toggling_it_moves_nothing(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(1920, 1080, 'F', 'white')")
        right = page.evaluate("(() => { const e = window.formvis.engine, v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return Math.round(b.left + v.toScreen(e.current.doc.width, 0).x); })()")
        assert right <= page.evaluate(BOX, ".cv-props-col")["l"], right                                   # fitted in the visible part
        pan = page.evaluate("[window.formvis.engine.current.viewport.panX, window.formvis.engine.current.viewport.zoom]")
        page.locator(".cv-props-col .cv-group-collapse").click()
        page.locator(".cv-strip-expand").click()
        assert page.evaluate("[window.formvis.engine.current.viewport.panX, window.formvis.engine.current.viewport.zoom]") == pan   # nothing moved
    finally:
        page.evaluate("localStorage.removeItem('formvis.propsColCollapsed')")


def test_a_narrow_window_shows_the_column_as_its_strip_and_keeps_the_choice(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(400, 300, 'N', 'white')")
        page.set_viewport_size({"width": 900, "height": 800})
        page.wait_for_function("document.querySelector('.cv-props-col').classList.contains('is-collapsed')")
        assert page.evaluate("localStorage.getItem('formvis.propsColCollapsed')") in (None, "0")        # the choice is kept
        page.set_viewport_size({"width": 1400, "height": 900})
        page.wait_for_function("!document.querySelector('.cv-props-col').classList.contains('is-collapsed')")
    finally:
        page.set_viewport_size({"width": 1400, "height": 900})


def test_reset_panels_restores_the_whole_layout(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'R', 'white')")
        # Disarrange: minimise Swatches on its Color tab, Layers on Paths, the side column collapsed and wider, the dock collapsed.
        page.locator("section.cv-swatches .cv-group-tab", has_text="Color").click()
        page.locator("section.cv-swatches .cv-group-min").click()
        page.locator(".cv-layers-panel .cv-group-tab[data-tab='paths']").click()
        page.evaluate("localStorage.setItem('formvis.propsOpenW', '400'); document.documentElement.style.setProperty('--cv-props-open-w', '400px')")
        page.locator(".cv-props-col .cv-group-collapse").click()
        page.locator(".cv-dock-collapse").click()
        page.evaluate("window.formvis.commands.run('reset-panels')")
        page.wait_for_timeout(300)
        assert not page.evaluate("document.querySelector('.cv-props-col').classList.contains('is-collapsed')")
        assert abs(page.locator(".cv-props-col").bounding_box()["width"] - 284) <= 1
        assert not page.evaluate("document.querySelector('.cv-layers').classList.contains('is-collapsed')")
        assert abs(page.locator(".cv-layers").bounding_box()["width"] - 288) <= 1
        assert not page.evaluate("document.querySelector('section.cv-swatches').classList.contains('is-min')")
        assert page.locator("section.cv-swatches .cv-group-tab.is-active").inner_text() == "Swatches"
        assert page.locator(".cv-layers-panel .cv-group-tab.is-active").inner_text() == "Layers"
    finally:
        page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
