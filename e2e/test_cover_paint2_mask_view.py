from io import BytesIO

from PIL import Image


def stage_pixel(page, x, y):
    box = page.evaluate("""([x, y]) => { const r = document.querySelector('.cv-stage').getBoundingClientRect(), v = window.formvis.engine.current.viewport;
      return [r.left + v.panX + x * v.zoom, r.top + v.panY + y * v.zoom]; }""", [x, y])
    im = Image.open(BytesIO(page.screenshot())).convert("RGB")
    return im.getpixel((int(box[0]), int(box[1])))


def hidden_mask_layer(page):
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'M', 'white')")
    page.evaluate("window.formvis.commands.run('add-mask-hide')")
    assert page.evaluate("!!window.formvis.engine.activeLayer.mask")


def test_alt_shift_click_on_the_mask_thumbnail_shows_the_mask_as_a_red_overlay(page):
    hidden_mask_layer(page)
    page.wait_for_timeout(300)
    r0, g0, b0 = stage_pixel(page, 60, 40)
    thumb = page.locator(".cv-layer-mask").first
    page.keyboard.down("Alt"); page.keyboard.down("Shift")
    thumb.click()
    page.keyboard.up("Shift"); page.keyboard.up("Alt")
    assert page.evaluate("window.formvis.engine.maskView.mode") == "rubylith"
    assert page.evaluate("window.formvis.engine.shownAlphas(window.formvis.engine.current).map((a) => a.name)") == ["Mask"]
    page.wait_for_timeout(500)
    r, g, b = stage_pixel(page, 60, 40)
    assert r > g + 80 and r > b + 80, (r, g, b)                                            # the hidden area is washed red
    assert abs(g - b) < 10


def test_view_mask_as_red_overlay_command_and_view_mask_alone_toggle(page):
    hidden_mask_layer(page)
    page.evaluate("window.formvis.commands.run('mask-view-red')")
    assert page.evaluate("window.formvis.engine.maskView.mode") == "rubylith"
    page.evaluate("window.formvis.commands.run('mask-view-red')")
    assert page.evaluate("window.formvis.engine.maskView") is None
    page.evaluate("window.formvis.commands.run('mask-view-alone')")
    assert page.evaluate("window.formvis.engine.maskView.mode") == "alone"
