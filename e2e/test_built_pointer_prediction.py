"""PC-AU-0163: with Low-latency drawing on, a brush drag asks each pointer move for the browser's predicted events and hovers the
tip at the last one (the stand-in below answers them, since a synthetic drag has none); with it off the predictions are never read."""
PATCH = """() => {
  window.__asked = 0;
  const real = PointerEvent.prototype.getPredictedEvents;
  PointerEvent.prototype.getPredictedEvents = function () {
    window.__asked++;
    const ahead = new PointerEvent('pointermove', { clientX: this.clientX + 40, clientY: this.clientY, pointerId: this.pointerId, bubbles: true });
    return [ahead];
  };
  PointerEvent.prototype.__real = real;
}"""


def drag(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(400, 300, 'P', 'white'); e.addLayer(); e.setBrush({ diameter: 12, hardness: 1, opacity: 1 }); e.setTool('brush'); }")
    page.evaluate(PATCH)
    box = page.evaluate("() => { const o = [...document.querySelectorAll('canvas')].filter((c) => getComputedStyle(c).pointerEvents !== 'none').sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; const r = o.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    page.mouse.move(box[0] - 60, box[1])
    page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(box[0] - 60 + i * 12, box[1], steps=1)
    page.mouse.up()
    return page.evaluate("() => window.__asked")


def test_prediction_is_read_during_a_brush_drag_when_low_latency_is_on(browser):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    ctx.add_init_script("try { localStorage.setItem('formvis.prefs', JSON.stringify({ lowLatency: true })); } catch (e) {}")
    page = ctx.new_page()
    from e2e.conftest import open_app
    open_app(page)
    asked = drag(page)
    ctx.close()
    assert asked >= 4, asked


def test_prediction_is_never_read_with_low_latency_off(browser):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    from e2e.conftest import open_app
    open_app(page)
    asked = drag(page)
    ctx.close()
    assert asked == 0, asked
