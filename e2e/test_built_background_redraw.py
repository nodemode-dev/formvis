"""PC-AU-0152: background full CPU redraws. With Composite on worker threads on and the CPU renderer, a large document is composed
in bands on workers and handed back whole, so the stage swaps one finished frame for the next: every frame the canvas shows during
a redraw is the old picture or the new one, never a half-drawn or blank mix. The scene canvas is read on every animation frame
while the top layer's opacity, blend mode and visibility change."""
PREFS = "try { localStorage.setItem('formvis.prefs', JSON.stringify({ workerComposite: true, useGpu: false, renderer: 'cpu' })); } catch (e) {}"
SAMPLER = """() => {
  const c = document.querySelector('.cv-scene'), g = c.getContext('2d', { willReadFrequently: true });
  const xs = [0.3, 0.42, 0.5, 0.58, 0.7], ys = [0.3, 0.42, 0.5, 0.58, 0.7];
  window.__frames = []; window.__sampling = true;
  const tick = () => {
    const seen = [];
    for (const fy of ys) for (const fx of xs) {
      const d = g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data;
      seen.push([d[0], d[1], d[2], d[3]]);
    }
    window.__frames.push(seen);
    if (window.__sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}"""
BUILD = """() => {
  const e = window.formvis.engine;
  e.newDocument(3200, 2400, 'Big', 'white');
  e.addLayer();
  e.fg = { r: 220, g: 20, b: 20 };
  e.fill('fg');
  e.zoomTo(1);
}"""


COUNT = """(() => {
  window.__bands = 0;
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (m, t) { if (m && m.type === 'band') window.__bands++; return post.call(this, m, t); };
})();"""


def runs(page):
    return page.evaluate("window.__bands")


def settled(page, colour, timeout=20000):
    page.wait_for_function("""(want) => {
      const c = document.querySelector('.cv-scene');
      if (!c) return false;
      const d = c.getContext('2d', { willReadFrequently: true }).getImageData(Math.round(c.width / 2), Math.round(c.height / 2), 1, 1).data;
      return Math.abs(d[0] - want[0]) < 4 && Math.abs(d[1] - want[1]) < 4 && Math.abs(d[2] - want[2]) < 4;
    }""", arg=colour, timeout=timeout)


def mixed(frames, allowed):
    """Frames where the sampled points were not one single colour from the allowed list (a half-drawn or blank frame)."""
    bad = []
    for i, f in enumerate(frames):
        first = f[0]
        uniform = all(all(abs(p[k] - first[k]) <= 3 for k in range(4)) for p in f)
        known = any(all(abs(first[k] - a[k]) <= 4 for k in range(3)) for a in allowed) and first[3] == 255
        if not (uniform and known):
            bad.append((i, f[:3]))
    return bad


def test_a_background_redraw_never_shows_a_partial_or_blank_frame(browser):
    ctx = browser.new_context(viewport={"width": 1900, "height": 1200})
    ctx.add_init_script(PREFS)
    ctx.add_init_script(COUNT)
    page = ctx.new_page()
    from e2e.conftest import open_app
    open_app(page)
    page.evaluate(BUILD)
    page.wait_for_function("window.formvis.engine.current.viewport.zoom === 1", timeout=20000)
    page.wait_for_timeout(600)
    page.evaluate("() => { const e = window.formvis.engine, v = e.current.viewport; v.panX = Math.round(v.panX); v.panY = Math.round(v.panY); e.emit('viewport', null); }")
    red = [220, 20, 20]
    settled(page, red)
    page.wait_for_function("window.__bands > 0", timeout=20000)
    before = runs(page)
    page.evaluate(SAMPLER)
    steps = [(0.5, [238, 138, 138]), (0.2, [248, 208, 208]), (1.0, red), (0.35, [243, 172, 172]), (1.0, red)]
    allowed = [[255, 255, 255], red]
    for opacity, colour in steps:
        page.evaluate(f"window.formvis.engine.setOpacity({opacity})")
        allowed.append(colour)
        settled(page, colour)
        page.wait_for_timeout(150)
    page.evaluate("window.__sampling = false")
    page.wait_for_timeout(100)
    frames = page.evaluate("window.__frames")
    assert len(frames) > 30, len(frames)
    seen = {tuple(f[0][:3]) for f in frames}
    assert len(seen) >= 3, seen
    bad = mixed(frames, allowed)
    after = runs(page)
    ctx.close()
    assert not bad, (len(bad), bad[:3])
    assert after > before, (before, after)
