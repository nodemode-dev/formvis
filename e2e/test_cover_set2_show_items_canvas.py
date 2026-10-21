import json
import re

import pytest

COUNT = """(() => { const c = document.querySelector('.cv-overlay-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"""


def menu(page, top, parent, label):
    page.locator(".cv-menu-btn", has_text=top).first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(parent) + "$"))).first.hover()
    page.wait_for_timeout(200)
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(label) + "$"))).last.click()
    page.wait_for_timeout(500)


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(500)


@pytest.fixture()
def doc(page):
    page.evaluate("localStorage.removeItem('formvis.viewExtras')")
    reload(page)
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'X', 'white')")
    page.wait_for_timeout(1200)
    yield
    page.evaluate("localStorage.removeItem('formvis.viewExtras')")
    reload(page)


def marquee(page):
    box = page.locator(".cv-stage").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.keyboard.press("m")
    page.wait_for_timeout(200)
    page.mouse.move(cx - 60, cy - 40)
    page.mouse.down()
    page.mouse.move(cx, cy, steps=5)
    page.mouse.move(cx + 60, cy + 40, steps=5)
    page.mouse.up()
    page.wait_for_timeout(600)


def test_show_selection_edges_draws_the_marching_ants_and_is_kept_after_a_reload(page, doc):
    marquee(page)
    assert page.evaluate("!!window.formvis.engine.current.selection")
    on = page.evaluate(COUNT)
    assert on > 0
    menu(page, "View", "Show", "Show Selection Edges")
    assert page.evaluate(COUNT) == 0
    assert json.loads(page.evaluate("localStorage.getItem('formvis.viewExtras')"))["selectionEdges"] is False
    reload(page)
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'X', 'white')")
    page.wait_for_timeout(1500)
    marquee(page)
    marquee(page) if not page.evaluate("!!window.formvis.engine.current.selection") else None
    assert page.evaluate("!!window.formvis.engine.current.selection")
    assert page.evaluate(COUNT) == 0
    menu(page, "View", "Show", "Show Selection Edges")
    assert page.evaluate(COUNT) > 0


def test_extras_off_hides_the_selection_edges_and_on_brings_them_back(page, doc):
    marquee(page)
    assert page.evaluate(COUNT) > 0
    page.locator(".cv-menu-btn", has_text="View").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^Extras$"))).last.click()
    page.wait_for_timeout(500)
    assert page.evaluate(COUNT) == 0
    page.locator(".cv-menu-btn", has_text="View").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^Extras$"))).last.click()
    page.wait_for_timeout(500)
    assert page.evaluate(COUNT) > 0


def test_show_layer_edges_outlines_the_active_layer_and_off_removes_it(page, doc):
    page.keyboard.press("m")
    page.wait_for_timeout(400)
    off = page.evaluate(COUNT)
    assert off == 0
    menu(page, "View", "Show", "Show Layer Edges")
    on = page.evaluate(COUNT)
    assert on > off, (off, on)
    menu(page, "View", "Show", "Show Layer Edges")
    assert page.evaluate(COUNT) == off


def test_show_grid_draws_gridlines_over_the_canvas(page, doc):
    off = page.evaluate(COUNT)
    page.locator(".cv-menu-btn", has_text="View").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^Show Grid$"))).last.click()
    page.wait_for_timeout(500)
    on = page.evaluate(COUNT)
    assert on > off * 1.5, (off, on)
    page.locator(".cv-menu-btn", has_text="View").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^Hide Grid$"))).last.click()
    page.wait_for_timeout(500)
    assert page.evaluate(COUNT) == off
