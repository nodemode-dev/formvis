# Blur, Sharpen and Smudge's options (1.51.4, the tool audit), each off and on, on real pixels.
ROW = "([y, x0, x1]) => { const l = window.formvis.engine.activeLayer, d = l.raster ? l.raster.ctx.getImageData(x0, y, x1 - x0, 1).data : new Uint8ClampedArray((x1 - x0) * 4), o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2], d[i + 3]]); return o; }"
EDGE = """(o) => { const e = window.formvis.engine; e.newDocument(200, 60, 'S', 'white'); const c = e.activeLayer.raster.ctx;
  c.fillStyle = `rgb(${o.left},${o.left},${o.left})`; c.fillRect(0, 0, 100, 60); c.fillStyle = `rgb(${o.right},${o.right},${o.right})`; c.fillRect(100, 0, 100, 60); e.activeLayer.raster.touch();
  if (o.emptyAbove) e.addLayer();
  Object.assign(e.retouch, { smearMode: o.tool, smearBlend: o.mode ?? 'normal', smearSampleAll: !!o.all, protectDetail: o.protect ?? true, fingerPainting: !!o.finger });
  e.setTool('smear'); e.fg = { r: 220, g: 20, b: 20 }; e.setBrush({ diameter: 30, hardness: 1, opacity: 1 }); }"""
STROKE = """(tool) => { const e = window.formvis.engine; for (let n = 0; n < 3; n++) {
  if (tool === 'smudge') { e.beginWarp('smudge', { x: 60, y: 30 }); for (let i = 1; i <= 20; i++) e.warpTo({ x: 60 + i * 4, y: 30 }); e.endWarp(); }
  else { e.beginRetouchStroke(tool, { x: 70, y: 30 }, false); for (let i = 1; i <= 20; i++) e.strokeTo({ x: 70 + i * 3, y: 30 }, 1); e.endStroke(); } } }"""


def run(page, **o):
    page.evaluate(EDGE, o)
    page.evaluate(STROKE, o["tool"])
    return page.evaluate(ROW, [30, 80, 121])


def test_blur_sample_all_layers_and_its_mode(page):
    off = run(page, tool="blur", left=0, right=255, emptyAbove=True)
    on = run(page, tool="blur", left=0, right=255, emptyAbove=True, all=True)
    assert all(p[3] == 0 for p in off) and any(p[3] > 200 and 30 < p[0] < 225 for p in on)            # grey only from all layers
    dark = run(page, tool="blur", left=0, right=255, mode="darken")
    assert dark[5][0] == 0 and min(p[0] for p in dark[21:30]) < 250                                     # never lightens; greys the white
    light = run(page, tool="blur", left=0, right=255, mode="lighten")
    assert light[35][0] == 255 and max(p[0] for p in light[10:19]) > 5                                 # never darkens; lifts the black


def test_sharpen_protect_detail_keeps_within_the_levels(page):
    plain = [p[0] for p in run(page, tool="sharpen", left=100, right=160, protect=False)]
    kept = [p[0] for p in run(page, tool="sharpen", left=100, right=160, protect=True)]
    assert min(plain) < 97 or max(plain) > 163, (min(plain), max(plain))                               # halos without it
    assert min(kept) >= 100 and max(kept) <= 160, (min(kept), max(kept))                                 # none with it


def test_smudge_finger_painting_and_sample_all_layers(page):
    white = run(page, tool="smudge", left=255, right=255)
    finger = run(page, tool="smudge", left=255, right=255, finger=True)
    assert all(p[:3] == [255, 255, 255] for p in white) and any(p[0] > 150 and p[1] < 150 for p in finger)   # the red dragged
    off = run(page, tool="smudge", left=200, right=200, emptyAbove=True)
    on = run(page, tool="smudge", left=200, right=200, emptyAbove=True, all=True)
    assert all(p[3] == 0 for p in off) and any(p[3] > 200 for p in on)                                   # sampled from beneath
