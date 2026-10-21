import json
import re

import pytest

SNAP = [("Snap To Layers", "layers"), ("Snap To Document Bounds", "bounds"), ("Snap To Slices", "slices")]
SHOW = ["Show Layer Edges", "Show Selection Edges", "Show Notes", "Show Count", "Brush Preview", "Mesh", "Edit Pins", "Target Path", "Smart Guides", "Artboard Guides"]


def item(page, parent, label):
    page.locator(".cv-menu-btn", has_text="View").first.click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has=page.locator(".cv-menu-label", has_text=re.compile("^" + parent + "$"))).first.hover()
    page.wait_for_timeout(200)
    return page.locator(".cv-menu:not([hidden]) .cv-menu-item", has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(label) + "$"))).last


def checked(page, parent, label):
    it = item(page, parent, label)
    on = "is-checked" in (it.get_attribute("class") or "")
    page.keyboard.press("Escape")
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    return on


def click(page, parent, label):
    item(page, parent, label).click()
    page.wait_for_timeout(250)


@pytest.fixture()
def doc(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'S', 'white')")


@pytest.mark.parametrize("label,key", SNAP)
def test_snap_to_item_toggles_from_the_view_menu_and_is_remembered(page, doc, label, key):
    before = checked(page, "Snap To", label)
    click(page, "Snap To", label)
    assert checked(page, "Snap To", label) is (not before)
    saved = json.loads(page.evaluate("localStorage.getItem('formvis.snap')"))
    assert saved[key] is (not before), saved
    click(page, "Snap To", label)
    assert checked(page, "Snap To", label) is before


@pytest.mark.parametrize("label", SHOW)
def test_show_item_toggles_from_the_view_menu(page, doc, label):
    before = checked(page, "Show", label)
    click(page, "Show", label)
    assert checked(page, "Show", label) is (not before)
    click(page, "Show", label)
    assert checked(page, "Show", label) is before
