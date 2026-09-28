PATCH = """(opts) => {
  const e = window.formvis.engine;
  e.newDocument(200, 100, 'P', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  c.fillStyle = 'rgb(200,40,40)'; c.fillRect(110, 20, 60, 60);
  l.raster.touch(); e.refresh();
  Object.assign(e.retouch, { patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10 }, opts);
  e.applySelection(window.__sel(20, 30, 40, 40), 'replace', 'Sel');
  e.patchSelection(100, 0);
  const d = l.raster.read(0, 0, 200, 100).data, px = (x, y) => Array.from(d.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 3));
  return { centre: px(40, 50), inner5: px(25, 50) };
}"""
SETUP = "async () => { const E = await import('/src/engine/index.ts'); window.__sel = (x, y, w, h) => E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)); }"
RED = lambda p: p[0] > 170 and p[1] < 80
GREY = lambda p: abs(p[0] - 128) < 25 and abs(p[1] - 128) < 25


def run(page, opts):
    page.evaluate(SETUP)
    return page.evaluate(PATCH, opts)


def test_diffusion_fades_the_colour_correction(page):
    assert GREY(run(page, {"patchDiffusion": 7})["centre"])        # full adaptation, as before
    assert RED(run(page, {"patchDiffusion": 1})["centre"])         # the source's own colour kept inside


def test_color_scales_the_blend_and_structure_the_rebuilt_edge(page):
    assert GREY(run(page, {"patchMode": "contentAware", "patchColor": 10})["centre"])
    assert RED(run(page, {"patchMode": "contentAware", "patchColor": 0})["centre"])      # a plain copy
    assert RED(run(page, {"patchMode": "contentAware", "patchColor": 0, "patchStructure": 7})["inner5"])
    assert not RED(run(page, {"patchMode": "contentAware", "patchColor": 0, "patchStructure": 1})["inner5"])


def test_the_bar_shows_each_mode_its_own_settings(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(100, 60, 'B', 'white'); e.setTool('patch'); })()")
    bar = page.locator(".cv-opt-group:not([hidden])")
    shown = lambda label: bar.locator(".cv-opt:not([hidden])", has_text=label).count() > 0
    bar.get_by_role("button", name="Normal", exact=True).click()
    bar.locator(".cv-opt:not([hidden])", has_text="Diffusion").first.wait_for()      # the bar updates on its next frame
    assert shown("Diffusion") and not shown("Structure") and not shown("Color")
    box = bar.locator(".cv-opt", has_text="Diffusion").locator("input[type=number]")
    box.fill("3"); box.press("Tab")
    assert page.evaluate("window.formvis.engine.retouch.patchDiffusion") == 3
    bar.get_by_role("button", name="Content-Aware", exact=True).click()
    bar.locator(".cv-opt:not([hidden])", has_text="Structure").first.wait_for()
    assert shown("Structure") and shown("Color") and not shown("Diffusion")
    page.evaluate("Object.assign(window.formvis.engine.retouch, { patchMode: 'normal', patchDiffusion: 7 })")
