SCENE = """async ([guide, grid, snapping]) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(400, 300, 'S', 'white');
  e.addLayer(); e.fg = { r: 0, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(20, 20, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.setView({ guides: true, grid, gridSpacing: 100, gridSubdivisions: 4 });
  if (guide) e.addGuide('x', 100);
  e.snapping = snapping;
  e.setTool('move');
  const v = e.current.viewport, r = document.querySelector('.cv-stage').getBoundingClientRect();
  return { from: [r.left + v.panX + 40 * v.zoom, r.top + v.panY + 40 * v.zoom], zoom: v.zoom };
}"""
LEFT = "(() => { const l = window.formvis.engine.current.activeLayer, d = l.raster.read(0, 0, l.raster.width, l.raster.height).data; for (let x = 0; x < l.raster.width; x++) for (let y = 0; y < l.raster.height; y++) if (d[(y * l.raster.width + x) * 4 + 3]) return x + l.transform.x; })()"


def drag(page, opts, doc_dx):
    s = page.evaluate(SCENE, opts)
    (x, y), z = s["from"], s["zoom"]
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + doc_dx * z / 2, y, steps=3)
    page.mouse.move(x + doc_dx * z, y, steps=3)
    page.mouse.up()
    return page.evaluate(LEFT)


def test_moves_snap_to_a_guide(page):
    # land the left edge inside the 6 screen pixel tolerance of the guide at x = 100, whatever the zoom
    z = page.evaluate(SCENE, [True, False, True])["zoom"]
    assert drag(page, [True, False, True], 80 - min(2, 3 / z)) == 100


def test_moves_snap_to_the_grid(page):
    # grid subdivision 25 px: an edge released at 73 snaps to 75
    assert drag(page, [False, True, True], 53) == 75


def test_no_snapping_when_it_is_off(page):
    assert drag(page, [True, True, False], 77) == 97
