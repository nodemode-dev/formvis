import io

from PIL import Image

SETUP = """() => { const e = window.formvis.engine; e.newDocument(300, 200, 'F', 'white'); e.setTool('marquee');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom, b.left + b.width / 2]; }"""
STAGE_BG = "getComputedStyle(document.querySelector('.cv-stage')).backgroundColor"


def red_left_block(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(20, 40))
    page.mouse.down()
    page.mouse.move(*at(80, 160), steps=5)
    page.mouse.up()
    page.evaluate("window.formvis.engine.fillWith({ color: { r: 255, g: 0, b: 0 } }, 'normal', 100, false)")
    page.keyboard.press("Control+d")
    page.evaluate("window.formvis.engine.setTool('hand')")
    page.mouse.move(5, 5)
    page.wait_for_timeout(400)
    return s


def spans(page, y=480):
    im = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
    red = [x for x in range(60, 820) if (lambda p: p[0] > 200 and p[1] < 60 and p[2] < 60)(im.getpixel((x, y)))]
    doc = [x for x in range(60, 820) if (lambda p: min(p) > 240 or (p[0] > 200 and p[1] < 60 and p[2] < 60))(im.getpixel((x, y)))]
    return (min(doc), max(doc), min(red), max(red)) if red and doc else None


def place(page, flipped):
    page.evaluate(f"window.formvis.engine.setViewFlip({str(flipped).lower()})")
    page.evaluate("window.formvis.commands.run('fit')")
    page.wait_for_timeout(600)
    d = spans(page)
    assert d, "picture or red block not drawn"
    return (((d[2] + d[3]) / 2) - d[0]) / (d[1] - d[0])


def test_flip_horizontal_mirrors_the_drawn_picture_and_flips_back(page):
    red_left_block(page)
    before = place(page, False)
    assert 0.1 < before < 0.25, before
    page.evaluate("window.formvis.commands.run('flip-view-h')")
    page.evaluate("window.formvis.commands.run('fit')")
    page.wait_for_timeout(600)
    d = spans(page)
    assert d, "picture or red block not drawn after the flip"
    after = (((d[2] + d[3]) / 2) - d[0]) / (d[1] - d[0])
    assert page.evaluate("window.formvis.engine.current.viewport.flipped") is True
    assert abs(after - (1 - before)) < 0.04, (before, after)
    page.evaluate("window.formvis.commands.run('flip-view-h')")
    assert abs(place(page, False) - before) < 0.04


def test_a_drag_on_a_flipped_view_lands_where_the_picture_is_drawn(page):
    s = red_left_block(page)
    place(page, True)
    page.evaluate("window.formvis.engine.setTool('marquee')")
    v = page.evaluate("(() => { const e = window.formvis.engine, w = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + w.panX, b.top + w.panY, w.zoom]; })()")
    d = spans(page)
    y = 480
    page.mouse.move(d[2] + 4, y)
    page.mouse.down()
    page.mouse.move(d[3] - 4, y + 20, steps=4)
    page.mouse.up()
    sel = page.evaluate("(() => { const q = window.formvis.engine.current.selection; return q && [q.x, q.w]; })()")
    assert sel and 15 <= sel[0] <= 30 and 40 <= sel[1] <= 62, (sel, v)


def test_pasteboard_colour_changes_the_area_round_the_picture_and_is_kept_after_a_reload(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(200, 100, 'P', 'white')")
        default = page.evaluate(STAGE_BG)
        for cmd, want in (("pasteboard-black", "rgb(0, 0, 0)"), ("pasteboard-mid", "rgb(128, 128, 128)"), ("pasteboard-light", "rgb(200, 200, 200)")):
            page.evaluate(f"window.formvis.commands.run('{cmd}')")
            assert page.evaluate(STAGE_BG) == want
        im = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
        r = page.evaluate("(() => { const b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
        assert im.getpixel((int(r[0] + 6), int(r[1] + r[3] - 6))) == (200, 200, 200)
        page.reload()
        page.wait_for_function("window.formvis && window.formvis.engine")
        page.wait_for_timeout(500)
        assert page.evaluate(STAGE_BG) == "rgb(200, 200, 200)"
        page.evaluate("window.formvis.commands.run('pasteboard-default')")
        assert page.evaluate(STAGE_BG) == default
    finally:
        page.evaluate("localStorage.removeItem('formvis.pasteboard')")
