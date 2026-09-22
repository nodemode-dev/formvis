MAKE = """([kind, opts]) => {
  const e = window.sonny.engine;
  e.newDocument(300, 200, 'S', 'white');
  e.fg = { r: 200, g: 30, b: 60 };
  Object.assign(e.shapeSettings, { kind }, opts);
  const before = e.current.doc.layers.length;
  if (kind === 'line' || kind === 'arrow') e.createPathShape({ x: 40, y: 100 }, { x: 260, y: 100 });
  else e.createPathShape({ x: 50, y: 30 }, { x: 250, y: 170 });
  const l = e.current.activeLayer, c = e.flattened().getContext('2d'), px = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data).slice(0, 3);
  return { added: e.current.doc.layers.length - before, name: l.name, vector: !!l.vector, closed: l.vector && l.vector.path.subpaths[0].closed,
           centre: px(150, 100), corner: px(52, 32), step: e.historySteps.names.slice(-1)[0] };
}"""
RED, WHITE = [200, 30, 60], [255, 255, 255]


def test_polygon_star_and_heart_fill_their_box(page):
    for kind, opts in [("polygon", {"sides": 6}), ("star", {"sides": 5, "starInset": 40}), ("heart", {})]:
        r = page.evaluate(MAKE, [kind, opts])
        label = kind.capitalize()
        assert r == {"added": 1, "name": f"{label} 1", "vector": True, "closed": True, "centre": RED, "corner": WHITE, "step": f"New {label}"}, kind


def test_line_and_arrow_follow_the_drag(page):
    r = page.evaluate(MAKE, ["line", {"weight": 10}])
    assert r["name"] == "Line 1" and r["centre"] == RED
    probe = page.evaluate("(() => { const c = window.sonny.engine.flattened().getContext('2d'); return [c.getImageData(150, 97, 1, 1).data[1], c.getImageData(150, 108, 1, 1).data[1]]; })()")
    assert probe == [30, 255]
    r = page.evaluate(MAKE, ["arrow", {"weight": 6, "headLength": 40, "headWidth": 50}])
    head = page.evaluate("(() => { const c = window.sonny.engine.flattened().getContext('2d'); return [c.getImageData(225, 118, 1, 1).data[1], c.getImageData(100, 118, 1, 1).data[1]]; })()")
    assert r["name"] == "Arrow 1" and head == [30, 255]


def test_path_shapes_recolor_and_undo(page):
    page.evaluate(MAKE, ["polygon", {"sides": 8}])
    r = page.evaluate("""(() => {
      const e = window.sonny.engine;
      e.fg = { r: 10, g: 200, b: 90 }; e.recolorShape();
      const c = () => Array.from(e.flattened().getContext('2d').getImageData(150, 100, 1, 1).data).slice(0, 3);
      const green = c(); e.undo(); const red = c(); e.undo(); const none = c();
      return { green, red, none, layers: e.current.doc.layers.length };
    })()""")
    assert r == {"green": [10, 200, 90], "red": [200, 30, 60], "none": [255, 255, 255], "layers": 1}
