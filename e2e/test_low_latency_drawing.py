"""PC-AU-0163: Low-latency drawing. On, the scene canvas is created desynchronized and a brush drag reads the browser's predicted
events; off, neither. Coalesced events are always consumed, and the frame trace times a stroke from the input to the drawn frame."""
from e2e.conftest import open_app

SETUP = """(zig) => {
  const e = window.formvis.engine; e.newDocument(600, 300, 'P', 'white'); e.addLayer();
  e.fg = { r: 0, g: 0, b: 0 }; e.setBrush({ diameter: 6, hardness: 1, opacity: 1 }); e.setTool('brush');
  window.__co = 0; window.__pr = 0;
  const gc = PointerEvent.prototype.getCoalescedEvents, gp = PointerEvent.prototype.getPredictedEvents;
  PointerEvent.prototype.getCoalescedEvents = function () {
    window.__co++;
    if (!zig || this.type !== 'pointermove') return gc.call(this);
    return [-30, 30, -30, 30].map((dy, i) => new PointerEvent('pointermove', { clientX: this.clientX - 40 + i * 12, clientY: this.clientY + dy, pointerId: this.pointerId, bubbles: true, buttons: 1 }));
  };
  PointerEvent.prototype.getPredictedEvents = function () { window.__pr++; return gp.call(this); };
}"""
COVER = "() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 600, 300).data; let n = 0, top = 300, bottom = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) { n++; const y = Math.floor(i / 4 / 600); top = Math.min(top, y); bottom = Math.max(bottom, y); } return [n, bottom - top]; }"
ATTRS = "() => { const x = document.querySelector('canvas.cv-scene').getContext('2d'); return x.getContextAttributes().desynchronized; }"


def stroke(page, zig):
    page.evaluate(SETUP, zig)
    box = page.evaluate("() => { const o = [...document.querySelectorAll('canvas')].filter((c) => getComputedStyle(c).pointerEvents !== 'none').sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; const r = o.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    page.evaluate("window.formvis.commands.run('frame-trace')")
    page.mouse.move(box[0] - 200, box[1])
    page.mouse.down()
    for i in range(1, 7):
        page.mouse.move(box[0] - 200 + i * 60, box[1], steps=1)
        page.wait_for_timeout(16)
    page.mouse.up()
    page.wait_for_timeout(300)
    return page.evaluate(COVER), page.evaluate("[window.__co, window.__pr]")


def session(browser, low):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    ctx.add_init_script("try { localStorage.setItem('formvis.prefs', JSON.stringify({ lowLatency: %s })); } catch (e) {}" % ("true" if low else "false"))
    page = ctx.new_page()
    open_app(page)
    return ctx, page


def test_on_the_scene_canvas_is_desynchronized_and_predictions_are_read(browser):
    ctx, page = session(browser, True)
    try:
        assert page.evaluate(ATTRS) is True
        cover, (co, pr) = stroke(page, False)
        assert cover[0] > 1000 and co >= 6 and pr >= 6, (cover, co, pr)
    finally:
        ctx.close()


def test_off_the_canvas_is_synchronized_and_predictions_are_not_read(browser):
    ctx, page = session(browser, False)
    try:
        assert page.evaluate(ATTRS) is False
        cover, (co, pr) = stroke(page, False)
        assert cover[0] > 1000 and co >= 6 and pr == 0, (cover, co, pr)
    finally:
        ctx.close()


def test_coalesced_points_are_laid_along_the_stroke_on_and_off(browser):
    spans = []
    for low in (True, False):
        ctx, page = session(browser, low)
        try:
            flat, _ = stroke(page, False)
            zig, _ = stroke(page, True)
            spans.append((flat, zig))
        finally:
            ctx.close()
    for flat, zig in spans:
        assert zig[1] > flat[1] + 30 and zig[0] > flat[0], spans


def test_the_frame_trace_times_the_stroke_frames(browser):
    ctx, page = session(browser, True)
    try:
        stroke(page, False)
        csv = page.evaluate("""() => { let t = ''; navigator.clipboard.writeText = (s) => { t = s; return Promise.resolve(); }; window.formvis.commands.run('copy-frame-trace'); return t; }""")
        lines = csv.strip().split("\n")[1:]
        totals = sorted(float(r.split(",")[1]) + float(r.split(",")[2]) for r in lines)
        assert len(lines) >= 6, len(lines)
        assert totals[len(totals) // 2] < 50, totals[len(totals) // 2]
    finally:
        ctx.close()
