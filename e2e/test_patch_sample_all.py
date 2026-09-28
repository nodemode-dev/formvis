PATCH = """async (sampleAll) => {
  const E = await import('/src/engine/index.ts');
  const e = window.formvis.engine;
  e.newDocument(200, 100, 'P', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  c.fillStyle = '#000'; c.fillRect(36, 46, 8, 8);
  bg.raster.touch();
  e.addLayer(); const work = p.activeLayer; work.raster = new E.Raster(200, 100);   // empty: fully transparent
  e.refresh();
  Object.assign(e.retouch, { patchMode: 'contentAware', patchFrom: 'source', patchTransparent: false, patchColor: 10, patchStructure: 5, patchSampleAll: sampleAll });
  e.applySelection(E.SelectionMask.cropped(28, 38, 24, 24, new Uint8Array(24 * 24).fill(255)), 'replace', 'Sel');
  e.patchSelection(80, 0);
  const d = work.raster.read(0, 0, 200, 100).data, i = (50 * 200 + 40) * 4;
  Object.assign(e.retouch, { patchMode: 'normal', patchSampleAll: false });
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}"""


def test_patch_sample_all_layers_patches_onto_an_empty_layer(page):
    assert page.evaluate(PATCH, False)[3] < 10                       # alone, the empty layer has nothing to patch
    fixed = page.evaluate(PATCH, True)
    assert fixed[3] > 245 and all(abs(v - 128) < 30 for v in fixed[:3]), fixed   # the dot covered in grey, on the new layer


def test_the_option_shows_in_content_aware_mode(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(100, 60, 'B', 'white'); e.setTool('patch'); })()")
    bar = page.locator(".cv-opt-group:not([hidden])")
    bar.get_by_role("button", name="Content-Aware", exact=True).click()
    bar.locator(".cv-opt:not([hidden])", has_text="Sample All Layers").first.wait_for()   # the bar updates on its next frame
    bar.get_by_role("button", name="Normal", exact=True).click()
    bar.locator(".cv-opt:not([hidden])", has_text="Diffusion").first.wait_for()
    assert bar.locator(".cv-opt:not([hidden])", has_text="Sample All Layers").count() == 0
