CLONE = """(opts) => {
  const e = window.sonny.engine;
  e.newDocument(220, 110, 'C', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#ff0000'; c.fillRect(20, 20, 20, 10);
  c.fillStyle = '#0000ff'; c.fillRect(36, 20, 4, 10);
  l.raster.touch(); e.refresh();
  Object.assign(e.retouch, { cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, cloneAligned: true, cloneSampleAll: false }, opts);
  e.setBrush({ diameter: 90, hardness: 1, opacity: 1 });
  e.setCloneSource({ x: 30, y: 25 });
  e.beginRetouchStroke('clone', { x: 150, y: 55 }, false); e.endStroke();
  const ctx = e.flattened().getContext('2d');
  const at = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return d[0] > 200 && d[2] < 60 ? 'R' : d[2] > 200 && d[0] < 60 ? 'B' : d[0] > 200 && d[1] > 200 ? 'W' : '?'; };
  return { step: e.historySteps.names.slice(-1)[0], at: Object.fromEntries([[145, 55], [158, 55], [150, 62], [170, 55], [150, 70], [142, 55], [150, 47]].map(([x, y]) => [`${x},${y}`, at(x, y)])) };
}"""


def test_plain_clone_copies_the_bar_as_is(page):
    r = page.evaluate(CLONE, {})
    assert r["step"] == "Clone Stamp"
    # bar 20 x 10 centred on (150, 55), blue tip at its right end (x 156 to 159)
    assert r["at"]["145,55"] == "R" and r["at"]["158,55"] == "B" and r["at"]["150,62"] == "W" and r["at"]["170,55"] == "W"


def test_scale_doubles_the_copy(page):
    r = page.evaluate(CLONE, {"cloneScale": 200})
    # 40 x 20 about (150, 55): x 130 to 169, y 45 to 64; the blue tip is x 162 to 169
    assert r["at"]["158,55"] == "R" and r["at"]["150,62"] == "R" and r["at"]["150,70"] == "W"


def test_rotation_turns_the_copy(page):
    r = page.evaluate(CLONE, {"cloneAngle": 90})
    # turned a quarter: 10 wide, 20 tall; the tip lands below the centre
    assert r["at"]["158,55"] == "W" and r["at"]["150,62"] == "B" and r["at"]["150,47"] == "R"


def test_flip_horizontal_mirrors_the_copy(page):
    r = page.evaluate(CLONE, {"cloneFlipH": True})
    assert r["at"]["142,55"] == "B" and r["at"]["158,55"] == "R"
