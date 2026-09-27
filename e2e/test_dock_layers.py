ORDER = "[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden).map((s) => s.className.split(' ')[0].replace('cv-', ''))"
LIST_H = "document.querySelector('.cv-layer-list').getBoundingClientRect().height"


def test_the_layers_panel_moves_and_keeps_the_space(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(200, 100, 'L', 'white')")
        assert page.evaluate(LIST_H) > 150                                               # the default arrangement
        page.evaluate("window.sonny.commands.run('panel-timeline'); window.sonny.commands.run('panel-history')")   # hidden by default, as the target's Essentials
        page.wait_for_timeout(100)
        space = page.evaluate(LIST_H)
        h = page.locator(".cv-layers-panel > .cv-panel-head").bounding_box()
        last = page.locator(".cv-history").bounding_box()
        page.mouse.move(h["x"] + 40, h["y"] + h["height"] / 2); page.mouse.down()
        page.mouse.move(last["x"] + 40, last["y"] + last["height"] + 4, steps=12); page.mouse.up()
        assert page.evaluate(ORDER) == ["navigator", "swatches", "timeline", "history", "layers-panel"], page.evaluate(ORDER)
        assert page.evaluate(LIST_H) >= space - 2               # at the bottom it still takes the space left
        # an arrangement saved before the Layers panel could move keeps it first
        page.evaluate("localStorage.setItem('sonny.dock', JSON.stringify({ order: ['history', 'paths', 'timeline'], hidden: [] }))")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel", "history", "timeline"]   # the retired paths id is ignored
    finally:
        page.evaluate("localStorage.removeItem('sonny.dock')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
