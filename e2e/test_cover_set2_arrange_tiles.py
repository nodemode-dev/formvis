import re

import pytest

TILES = """JSON.stringify([...document.querySelectorAll('.cv-view-tile')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }))"""
FLOATS = """JSON.stringify([...document.querySelectorAll('.cv-float')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; }))"""


def arrange(page, label):
    page.locator(".cv-menu-btn", has_text="Window").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has=page.locator(".cv-menu-label", has_text=re.compile("^Arrange$"))).first.hover()
    page.wait_for_timeout(200)
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(label) + "$"))).last.click()
    page.wait_for_timeout(500)


def tiles(page):
    import json
    return json.loads(page.evaluate(TILES))


@pytest.fixture()
def three_docs(page):
    for n in "ABC":
        page.evaluate(f"window.formvis.engine.newDocument(300, 200, '{n}', 'white')")
    page.wait_for_timeout(300)
    yield
    arrange(page, "Consolidate All to Tabs")


@pytest.mark.parametrize("label", ["Tile All Vertically", "3-up Vertical"])
def test_vertical_tile_layouts_put_the_views_side_by_side(page, three_docs, label):
    arrange(page, label)
    t = tiles(page)
    assert len(t) == 2, t
    assert t[0][1] == t[1][1] and t[0][0] < t[1][0] and t[0][3] == t[1][3], t
    assert t[0][3] > t[0][2], t


@pytest.mark.parametrize("label", ["Tile All Horizontally", "3-up Horizontal"])
def test_horizontal_tile_layouts_stack_the_views(page, three_docs, label):
    arrange(page, label)
    t = tiles(page)
    assert len(t) == 2, t
    assert t[0][0] == t[1][0] and t[0][1] < t[1][1] and t[0][2] == t[1][2], t
    assert t[0][2] > t[0][3], t


def test_tile_picks_the_layout_that_fits_three_open_documents(page, three_docs):
    arrange(page, "Tile")
    t = tiles(page)
    assert len(t) == 2 and t[0][0] == t[1][0] and t[0][1] < t[1][1], t


def test_consolidate_to_tabs_removes_the_tiles_and_cascade_offsets_floating_windows(page, three_docs):
    import json
    arrange(page, "Tile All Vertically")
    assert len(tiles(page)) == 2
    arrange(page, "Consolidate All to Tabs")
    assert tiles(page) == []
    arrange(page, "Float All in Windows")
    arrange(page, "Cascade")
    f = json.loads(page.evaluate(FLOATS))
    assert len(f) >= 2, f
    steps = {(b[0] - a[0], b[1] - a[1]) for a, b in zip(f, f[1:])}
    assert len(steps) == 1 and all(dx > 0 and dy > 0 for dx, dy in steps), f
