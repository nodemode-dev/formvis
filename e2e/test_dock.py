ORDER = "[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden).map((s) => s.className.split(' ')[0].replace('cv-', ''))"
EXPANDED = "document.querySelector('.cv-history-toggle').getAttribute('aria-expanded')"


def test_panels_move_hide_and_reset(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(200, 100, 'D', 'white')")
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel"]
        page.evaluate("window.formvis.commands.run('panel-timeline'); window.formvis.commands.run('panel-history')")   # hidden by default, as the target's Essentials
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel", "timeline", "history"]
        before = page.evaluate(EXPANDED)
        h = page.locator(".cv-history .cv-panel-head").bounding_box()
        p = page.locator(".cv-timeline .cv-panel-head").bounding_box()
        page.mouse.move(h["x"] + 60, h["y"] + h["height"] / 2); page.mouse.down()
        page.mouse.move(p["x"] + 60, p["y"] + 2, steps=12); page.mouse.up()
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel", "history", "timeline"], page.evaluate(ORDER)
        assert page.evaluate(EXPANDED) == before                       # the drag did not also fold or unfold it
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel", "history", "timeline"]   # remembered
        page.locator(".cv-menu-btn", has_text="Window").click()
        page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text="Timeline").click()
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel", "history"]
        assert page.evaluate("window.formvis.commands.run('reset-panels')")
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel"]                  # the default again
    finally:
        page.evaluate("localStorage.removeItem('formvis.dock')")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
