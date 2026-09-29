from e2e.conftest import open_app

SETUP = """
(() => {
  const e = window.formvis.engine;
  e.newDocument(64, 64, 'T', 'white');
  e.fg = { r: 100, g: 150, b: 200 }; e.fill('fg');
  e.addLayer(); e.fg = { r: 200, g: 100, b: 50 }; e.fill('fg');
  return e.current.activeId;
})()
"""
PIXEL = "(() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 10, 1, 1).data).slice(0, 3))()"


def test_failing_operation_rolls_back_pixels_and_structure(page):
    r = page.evaluate("""() => {
      const e = window.formvis.engine;
      e.newDocument(40, 30, 'R', 'white');
      const p = e.current, l = p.activeLayer, steps = e.historySteps.names.length, name = l.name;
      e['regionEdit']('Broken Fill', ({ raster }) => { raster.ctx.fillStyle = '#f00'; raster.ctx.fillRect(0, 0, 40, 30); throw new Error('deliberate'); });
      const ok = e.edit('Broken Rename', (q) => { q.updateLayer(l.id, { name: 'X' }); throw new Error('deliberate'); });
      return { px: Array.from(l.raster.read(5, 5, 1, 1).data), ok, name: p.doc.layers[0].name === name, steps: e.historySteps.names.length === steps,
               open: p.history.open, failures: e.failures.length, next: e.edit('Rename', (q) => q.updateLayer(l.id, { name: 'Y' })) };
    }""")
    assert r == {"px": [255, 255, 255, 255], "ok": False, "name": True, "steps": True, "open": False, "failures": 2, "next": True}


def test_uncaught_errors_are_logged_and_the_app_keeps_working(page):
    page.evaluate("setTimeout(() => { throw new Error('deliberate'); }, 0)")
    page.wait_for_timeout(100)
    log = page.evaluate("window.formvis.errorLog.text()")
    version = page.evaluate("(async () => (await import('/src/version.ts')).VERSION)()")
    assert "deliberate" in log and f"formvis {version}" in log
    assert page.evaluate("window.formvis.engine.newDocument(10, 10, 'A', 'white'), window.formvis.engine.current.doc.width") == 10


def test_unsaved_work_is_offered_back_after_reload(context):
    page = context.new_page()
    open_app(page)
    page.evaluate("""async () => {
      const e = window.formvis.engine;
      // The question after a crash is how formvis recovers with session restore off (1.52.4; on, it reopens silently).
      localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), restoreSession: false }));
      e.newDocument(20, 20, 'Keep', 'white');
      e.edit('Rename', (q) => q.updateLayer(q.doc.layers[0].id, { name: 'Kept' }));
      await window.formvis.keepModified();
    }""")
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.get_by_role("button", name="Recover").click()
    page.wait_for_timeout(500)
    r = page.evaluate("(() => { const p = window.formvis.engine.current; return [p.name, p.modified, p.doc.layers[0].name]; })()")
    assert r == ["Keep (recovered)", True, "Kept"]


def test_pixel_blend_modes_composite_by_formula(page):
    page.evaluate(SETUP)
    want = {"linear-burn": [45, 0, 0], "vivid-light": [232, 121, 115], "linear-light": [245, 95, 45], "pin-light": [145, 150, 100],
            "hard-mix": [255, 0, 0], "subtract": [0, 50, 150], "divide": [128, 255, 255], "darker-color": [200, 100, 50], "lighter-color": [100, 150, 200]}
    for mode, rgb in want.items():
        page.evaluate(f"window.formvis.engine.setBlend('{mode}')")
        assert page.evaluate(PIXEL) == rgb, mode


def test_adjustment_layers_composite_and_undo(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(32, 32, 'A', 'white'); e.fg = { r: 200, g: 100, b: 50 }; e.fill('fg'); })()")
    cases = [("invert", "{}", [55, 155, 205]), ("posterize", "{ levels: 4 }", [170, 85, 85]), ("brightnessContrast", "{ brightness: 50 }", [217, 137, 86])]
    for kind, params, rgb in cases:
        page.evaluate(f"""(() => {{ const e = window.formvis.engine, id = e.addAdjustmentLayer('{kind}');
          e.edit('set', (q) => {{ const l = q.layer(id); q.updateLayer(id, {{ adjustment: {{ kind: '{kind}', data: {{ ...l.adjustment.data, params: {{ ...l.adjustment.data.params, ...{params} }} }} }} }}); }}); }})()""")
        assert page.evaluate("(() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(5, 5, 1, 1).data).slice(0, 3))()") == rgb, kind
        page.evaluate("window.formvis.engine.undo(); window.formvis.engine.undo()")
        assert page.evaluate("(() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(5, 5, 1, 1).data).slice(0, 3))()") == [200, 100, 50]


def test_align_distribute_and_undo(page):
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(200, 100, 'A', 'white');
      const sq = (x, y) => { e.addLayer(); e.applySelection(E.SelectionMask.cropped(x, y, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); return e.current.activeId; };
      const ids = [sq(10, 5), sq(50, 40), sq(150, 70)];
      const left = (id) => { const l = e.current.layer(id), d = l.raster.read(0, 0, l.raster.width, l.raster.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) return [(i / 4) % l.raster.width + l.transform.x, Math.floor(i / 4 / l.raster.width) + l.transform.y]; };
      e.current.selectedIds = new Set(ids);
      e.distributeLayers('hcenter'); const dist = ids.map(left);
      e.alignLayers('left'); e.alignLayers('bottom'); const aligned = ids.map(left);
      e.undo(); e.undo(); e.undo();
      return { dist, aligned, back: ids.map(left) };
    }""")
    assert r["dist"] == [[10, 5], [80, 40], [150, 70]]
    assert r["aligned"] == [[10, 70], [10, 70], [10, 70]]
    assert r["back"] == [[10, 5], [50, 40], [150, 70]]


def test_feather_border_smooth(page):
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts'), v = (x, y) => e.current.selection.valueAt(x, y);
      e.newDocument(200, 100, 'A', 'white');
      const sq = () => e.applySelection(E.SelectionMask.cropped(50, 20, 60, 60, new Uint8Array(3600).fill(255)), 'replace', 's');
      sq(); e.modifySelection('feather', 10); const feather = [v(50, 50), v(55, 50), v(45, 50)];
      sq(); e.modifySelection('border', 4); let ring = 0; for (let x = 40; x < 120; x++) if (v(x, 50) > 127) ring++;
      return { feather, ring };
    }""")
    assert all(abs(a - b) <= 2 for a, b in zip(r["feather"], [138, 220, 47]))
    assert r["ring"] == 8
