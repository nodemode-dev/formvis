import functools

from playwright.sync_api import Error as PlaywrightError

KINDS = ["brightnessContrast", "levels", "curves", "exposure", "vibrance", "hsv", "colorBalance", "blackWhite", "photoFilter", "channelMixer", "colorLookup", "invert", "posterize", "threshold", "gradientMap", "selectiveColor"]
CHANGES_AT_DEFAULTS = {"blackWhite", "photoFilter", "colorLookup", "invert", "posterize", "threshold", "gradientMap"}
INSIDE_WHEN_STRONG = {
    "brightnessContrast": {"brightness": 50},
}

CASE = """async ([kind, strong]) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 100, 'M', 'white');
  const c = e.current.activeLayer.raster.ctx, g = c.createLinearGradient(0, 0, 200, 0);
  g.addColorStop(0, 'rgb(200,60,40)'); g.addColorStop(1, 'rgb(40,90,200)'); c.fillStyle = g; c.fillRect(0, 0, 200, 100);
  e.current.activeLayer.raster.touch(); e.refresh();
  const px = (x) => Array.from(e.flattened().getContext('2d').getImageData(x, 50, 1, 1).data).slice(0, 3);
  const before = [px(50), px(150)];
  e.applySelection(E.SelectionMask.cropped(0, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's');
  const ok = window.formvis.commands.run('new-adj-' + kind);
  const l = e.current.activeLayer;
  const m = l.mask && l.mask.raster ? [l.mask.raster.ctx.getImageData(50, 50, 1, 1).data[3], l.mask.raster.ctx.getImageData(150, 50, 1, 1).data[3]] : null;
  const res = { ok, kind: l.adjustment && l.adjustment.kind, mask: m, selectionCleared: !e.current.selection, step: e.historySteps.names.slice(-1)[0], before, after: [px(50), px(150)] };
  if (strong) {
    e.edit('set', (q) => { q.updateLayer(l.id, { adjustment: { kind, data: { ...l.adjustment.data, params: { ...l.adjustment.data.params, ...strong } } } }); });
    res.strong = [px(50), px(150)];
  }
  return res;
}"""


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


@steady
def test_every_new_adjustment_layer_takes_the_selection_as_its_mask(page):
    for kind in KINDS:
        r = page.evaluate(CASE, [kind, INSIDE_WHEN_STRONG.get(kind)])
        page.keyboard.press("Escape")
        assert r["ok"] is True and r["kind"] == kind, (kind, r)
        assert r["mask"] == [255, 0] and r["selectionCleared"] is True, (kind, r)
        assert r["after"][1] == r["before"][1], (kind, r)
        assert r["step"].startswith("New ") and r["step"].endswith(" Layer"), (kind, r)
        if kind in CHANGES_AT_DEFAULTS:
            assert r["after"][0] != r["before"][0], (kind, r)
        else:
            assert r["after"][0] == r["before"][0], (kind, r)
        if "strong" in r:
            assert r["strong"][0] != r["before"][0] and r["strong"][1] == r["before"][1], (kind, r)
