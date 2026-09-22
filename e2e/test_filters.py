STEP = """
(() => {
  const e = window.sonny.engine;
  e.newDocument(120, 80, 'F', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(40,40,40)'; c.fillRect(0, 0, 60, 80); c.fillStyle = 'rgb(210,210,210)'; c.fillRect(60, 0, 60, 80); l.raster.touch();
  e.refresh();
})()
"""
ROW = "(() => { const c = window.sonny.engine.flattened().getContext('2d'); return Array.from({ length: 12 }, (_, i) => c.getImageData(54 + i, 40, 1, 1).data[0]); })()"


def run_filter(page, kind):
    page.evaluate(f"window.sonny.commands.run('filter-{kind}')")
    page.wait_for_timeout(800)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(800)


def test_lens_blur_through_the_dialog_softens_and_undoes(page):
    page.evaluate(STEP)
    before = page.evaluate(ROW)
    run_filter(page, "lensBlur")
    after = page.evaluate(ROW)
    assert after[0] > before[0] and after[-1] < before[-1]
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Lens Blur"
    page.evaluate("window.sonny.engine.undo()")
    assert page.evaluate(ROW) == before


def test_smart_sharpen_through_the_dialog_raises_edge_contrast(page):
    page.evaluate(STEP)
    before = page.evaluate(ROW)
    run_filter(page, "smartSharpen")
    after = page.evaluate(ROW)
    assert after[5] < before[5] or after[6] > before[6]
    assert min(after) <= min(before) and max(after) >= max(before)


def test_sharpen_brush_stroke(page):
    page.evaluate(STEP)
    page.evaluate("(() => { const e = window.sonny.engine, l = e.current.activeLayer, c = l.raster.ctx; const src = c.getImageData(0, 0, 120, 80); c.filter = 'blur(2px)'; c.drawImage(c.canvas, 0, 0); c.filter = 'none'; l.raster.touch(); })()")
    blurred = page.evaluate(ROW)
    r = page.evaluate("""(() => {
      const e = window.sonny.engine;
      e.retouch.smearMode = 'sharpen'; e.brush.diameter = 60; e.brush.opacity = 1;
      const ok = e.beginRetouchStroke('sharpen', { x: 60, y: 20 }, false);
      e.strokeTo({ x: 60, y: 40 }); e.strokeTo({ x: 60, y: 60 }); e.endStroke();
      return { ok, step: e.historySteps.names.slice(-1)[0] };
    })()""")
    assert r == {"ok": True, "step": "Sharpen"}
    sharp = page.evaluate(ROW)
    assert sharp[4] <= blurred[4] and sharp[7] >= blurred[7] and sharp != blurred
