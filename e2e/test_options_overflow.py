EDGES = "[...document.querySelectorAll('.cv-options-edge')].map((b) => !b.hidden)"


def test_an_overflowing_options_bar_moves_its_settings_into_more(page):
    page.set_viewport_size({"width": 640, "height": 700})
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(200, 100, 'O', 'white'); e.setTool('move'); })()")
    page.wait_for_timeout(200)
    assert page.evaluate(EDGES) == [False, False]
    assert page.evaluate("(() => { const o = document.querySelector('.cv-options'); return o.scrollWidth <= o.clientWidth; })()")
    assert page.locator(".cv-opt-more").is_visible()
