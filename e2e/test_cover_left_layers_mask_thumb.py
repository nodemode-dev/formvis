import pytest

SCENE = """() => { const e = window.formvis.engine; e.newDocument(100, 100, 'T', 'white'); e.deselect(); const c = e.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(255,0,0)'; c.fillRect(0, 0, 100, 100); e.activeLayer.raster.touch(); e.addMask(true, false); e.refresh(); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
ENABLED = "window.formvis.engine.activeLayer.mask.enabled"


def test_shift_click_on_the_mask_thumbnail_disables_and_enables_the_mask(page):
    # PC-UI-0822
    page.evaluate(SCENE)
    assert page.evaluate(PX, [50, 50])[3] == 0
    thumb =page.locator(".cv-layer-mask:visible").first
    thumb.wait_for()
    thumb.click(modifiers=["Shift"], force=True)
    page.wait_for_function(f"{ENABLED} === false", timeout=5000)
    assert page.evaluate(PX, [50, 50])[:3] == [255, 0, 0]
    thumb.click(modifiers=["Shift"], force=True)
    page.wait_for_function(f"{ENABLED} !== false", timeout=5000)
    assert page.evaluate(PX, [50, 50])[3] == 0


def test_clicking_the_mask_thumbnail_targets_the_mask_for_painting(page):
    # PC-UI-0822
    page.evaluate(SCENE)
    page.locator(".cv-layer-thumb:visible").first.click(force=True)
    page.wait_for_function("window.formvis.engine.current.maskTarget === false", timeout=3000)
    page.locator(".cv-layer-mask:visible").first.click(force=True)
    page.wait_for_function("window.formvis.engine.current.maskTarget === true", timeout=3000)
    page.locator(".cv-layer-thumb:visible").first.click(force=True)
    page.wait_for_function("window.formvis.engine.current.maskTarget === false", timeout=3000)
