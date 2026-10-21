import io

from PIL import Image

try:
    from e2e.files2_support import start, steady
except ImportError:
    from files2_support import start, steady

DOC = """(tool) => {
  const e = window.formvis.engine;
  e.newDocument(160, 100, 'Foot', 'white');
  const k = e.activeLayer.raster.ctx;
  k.fillStyle = '#c83232'; k.fillRect(0, 0, 160, 100);
  k.fillStyle = '#2832c8'; k.fillRect(0, 60, 60, 40);
  e.activeLayer.raster.touch(); e.refresh();
  e.setTool(tool); e.setBrush({ diameter: 20 });
}"""
SCREEN = """([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"""
RED = (200, 50, 50)
BLUE = (40, 50, 200)
LIGHTENED = (224, 141, 141)


def at(page, x, y):
    return tuple(page.evaluate(SCREEN, [x, y]))


def shot(page, x, y):
    sx, sy = at(page, x, y)
    png = page.screenshot(clip={"x": sx - 1, "y": sy - 1, "width": 2, "height": 2})
    return Image.open(io.BytesIO(png)).convert("RGB").getpixel((1, 1))


def near(a, b, tol=6):
    return all(abs(p - q) <= tol for p, q in zip(a, b))


def drag(page, x0, x1, y):
    page.mouse.move(*at(page, x0, y))
    page.mouse.down()
    page.mouse.move(*at(page, x1, y), steps=10)
    page.wait_for_timeout(300)


def release(page):
    page.mouse.up()
    page.wait_for_timeout(1500)


def set_source(page, x, y):
    page.keyboard.down("Alt")
    page.mouse.click(*at(page, x, y))
    page.keyboard.up("Alt")


@steady
def test_the_retouch_footprint_trail_shows_while_dragging_and_is_gone_on_release(page, tmp_path):
    start(page)

    for mode in ("contentAware", "createTexture", "proximityMatch"):
        page.evaluate(DOC, "spotHealing")
        page.evaluate("(m) => { window.formvis.engine.retouch.healMode = m; }", mode)
        page.wait_for_timeout(400)
        drag(page, 40, 120, 30)
        assert near(shot(page, 80, 30), LIGHTENED), (mode, shot(page, 80, 30))
        assert near(shot(page, 80, 15), RED), (mode, shot(page, 80, 15))
        release(page)
        assert near(shot(page, 80, 30), RED), (mode, shot(page, 80, 30))

    page.evaluate(DOC, "remove")
    page.wait_for_timeout(400)
    drag(page, 40, 120, 30)
    assert near(shot(page, 80, 30), LIGHTENED), shot(page, 80, 30)
    assert near(shot(page, 80, 15), RED), shot(page, 80, 15)
    release(page)
    assert near(shot(page, 80, 30), RED), shot(page, 80, 30)

    for tool in ("cloneStamp", "healingBrush"):
        page.evaluate(DOC, tool)
        page.wait_for_timeout(400)
        set_source(page, 10, 80)
        drag(page, 10, 50, 30)
        assert near(shot(page, 30, 30), BLUE, 12), (tool, shot(page, 30, 30))
        assert near(shot(page, 30, 10), RED), (tool, shot(page, 30, 10))
        release(page)
        if tool == "cloneStamp":
            assert near(shot(page, 30, 30), BLUE, 12), (tool, shot(page, 30, 30))
        else:
            assert near(shot(page, 30, 30), RED, 12), (tool, shot(page, 30, 30))

    page.evaluate(DOC, "quickSelect")
    page.wait_for_timeout(400)
    drag(page, 40, 120, 30)
    assert shot(page, 80, 30)[1] > RED[1] + 40, shot(page, 80, 30)
    assert near(shot(page, 80, 15), RED, 12), shot(page, 80, 15)
    release(page)
    assert near(shot(page, 80, 30), RED, 12), shot(page, 80, 30)
