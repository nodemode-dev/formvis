DRAW = """([shape, pts]) => {
  const e = window.sonny.engine;
  e.newDocument(200, 200, 'G', 'white');
  Object.assign(e.gradientSettings, { shape, style: 'black-white', reversed: false, opacity: 1 });
  e.beginGradient({ x: 100, y: 100 }); e.updateGradient({ x: 100, y: 100 }, { x: 150, y: 100 }); e.commitGradient();
  const c = e.flattened().getContext('2d');
  return pts.map(([x, y]) => c.getImageData(x, y, 1, 1).data[0]);
}"""


def near(got, want, tol=6):
    return all(abs(g - w) <= tol for g, w in zip(got, want))


def test_linear_and_reflected(page):
    assert near(page.evaluate(DRAW, ["linear", [[90, 100], [125, 100], [160, 100]]]), [0, 128, 255])
    assert near(page.evaluate(DRAW, ["reflected", [[75, 100], [100, 100], [125, 100], [40, 100]]]), [128, 0, 128, 255])


def test_radial_angle_and_diamond(page):
    assert near(page.evaluate(DRAW, ["radial", [[100, 100], [100, 125], [125, 100], [100, 160]]]), [0, 128, 128, 255])
    # conic from the drag direction (0 degrees): a quarter turn clockwise on screen is a quarter of the way
    assert near(page.evaluate(DRAW, ["angle", [[130, 100], [100, 130], [70, 100]]]), [0, 64, 128], tol=8)
    assert near(page.evaluate(DRAW, ["diamond", [[100, 100], [125, 100], [112, 112], [100, 125], [160, 100]]]), [0, 128, 122, 128, 255], tol=8)


def test_gradient_is_one_step_and_undoes(page):
    page.evaluate(DRAW, ["diamond", [[0, 0]]])
    r = page.evaluate("(() => { const e = window.sonny.engine; const n = e.historySteps.names.slice(-1)[0]; e.undo(); return [n, e.flattened().getContext('2d').getImageData(100, 100, 1, 1).data[0]]; })()")
    assert r == ["Gradient", 255]
