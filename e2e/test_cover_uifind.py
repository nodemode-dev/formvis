from e2e.act_support import start, steady

TWO_TONE = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(200, 100, 'C', 'white'); e.addLayer();
  e.fg = { r: 50, g: 50, b: 50 }; e.applySelection(E.SelectionMask.cropped(0, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg');
  e.fg = { r: 200, g: 200, b: 200 }; e.applySelection(E.SelectionMask.cropped(100, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
VIEW = "() => { const e = window.formvis.engine, v = e.current.viewport; v.zoom = 1; v.panX = 30; v.panY = 150; e.emit('render', null); e.emit('overlay', null); }"
PICK = "(m) => { const d = [...document.querySelectorAll('select')].find((s) => s.offsetParent && /Eyedropper/.test(s.closest('.cv-field')?.textContent ?? '')); d.value = m; d.dispatchEvent(new Event('change', { bubbles: true })); }"
CURVE = "() => window.formvis.engine.current.activeLayer.adjustment.data.curves.channels[1].map((p) => [p.x, p.y])"
JOBS = "() => { const r = document.querySelector('.cv-jobs'); if (!r || r.hidden) return null; const b = r.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + 12); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, hit: !!(hit && r.contains(hit)) }; }"
TOGGLE = "(t) => { const b = [...document.querySelectorAll('label.cv-check')].find((x) => x.offsetParent && x.textContent.trim() === t).querySelector('input'); b.click(); return b.checked; }"
BLEND_SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(60, 40, 'B', 'white'); e.addLayer(); e.fg = { r: 200, g: 60, b: 40 };
  e.applySelection(E.SelectionMask.cropped(5, 5, 30, 20, new Uint8Array(600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  window.formvis.commands.run('layer-style'); }"""
ROUND = """async () => { const P = await import('/src/io/project-io.ts'), e = window.formvis.engine;
  const s = await P.serialize(e.current.doc, e.current.activeId), by = new Map(s.files.map((f) => [f.name, f.blob]));
  const o = await P.deserialize(s.manifest, async (n) => by.get(n)), l = o.doc.layers.find((x) => x.id === e.current.activeId);
  return [l.blendInterior, l.layerMaskHides]; }"""
PSD = """async () => { const S = await import('/src/io/psd.ts'), e = window.formvis.engine;
  const w = await S.writePsdFile(e.current.doc, e.flattened()), r = await S.readPsdFile(new File([w.bytes], 'b.psd', { type: 'image/vnd.adobe.photoshop' }));
  const l = r.doc.layers.find((x) => x.name === 'Layer 1'); return [l.blendInterior, l.layerMaskHides]; }"""
WARP = """() => { const e = window.formvis.engine; e.beginMeshWarp(4); const w = e.meshWarpEdit; e.moveMeshWarpPoint(5, { x: w.points[5][0] + 12, y: w.points[5][1] + 9 }); const a = e.meshWarpEdit.points.map((q) => [...q]); e.applyMeshWarp(); e.beginMeshWarp(4); return [a, e.meshWarpEdit.points.map((q) => [...q])]; }"""
SMART = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(100, 80, 'W', 'white'); e.addLayer(); e.fg = { r: 200, g: 60, b: 40 };
  e.applySelection(E.SelectionMask.cropped(10, 10, 80, 60, new Uint8Array(4800).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.convertToSmartObject(); }"""


def click_doc(page, x, y):
    at = page.evaluate("([x, y]) => { const c = document.querySelector('.cv-overlay-canvas').getBoundingClientRect(), v = window.formvis.engine.current.viewport; return { x: c.left + v.panX + x * v.zoom, y: c.top + v.panY + y * v.zoom }; }", [x, y])
    page.mouse.click(at["x"], at["y"])
    page.wait_for_timeout(400)


@steady
def test_jobs_panel_opens_on_screen_at_once_with_no_job_running(page, tmp_path):
    start(page)
    page.evaluate("window.formvis.commands.run('jobs-list')")
    page.wait_for_timeout(200)
    r = page.evaluate(JOBS)
    size = page.evaluate("[innerWidth, innerHeight]")
    assert r and r["top"] >= 0 and r["left"] >= 0 and r["right"] <= size[0] and r["bottom"] <= size[1] and r["hit"]


@steady
def test_second_curves_eyedropper_reads_the_picture_beneath_the_layer(page, tmp_path):
    start(page)
    page.evaluate(TWO_TONE)
    page.evaluate("window.formvis.commands.run('new-adj-curves')")
    page.evaluate(VIEW)
    page.wait_for_timeout(600)
    page.evaluate(PICK, "c-black")
    click_doc(page, 20, 50)
    page.evaluate(PICK, "c-white")
    click_doc(page, 170, 50)
    pts = page.evaluate(CURVE)
    assert [50, 0] in pts and [200, 255] in pts


@steady
def test_blending_switches_persist_without_effects_through_fvd_and_psd(page, tmp_path):
    start(page)
    page.evaluate(BLEND_SETUP)
    page.wait_for_timeout(600)
    assert page.evaluate(TOGGLE, "Blend Interior Effects as Group") is True
    assert page.evaluate(TOGGLE, "Layer Mask Hides Effects") is False
    page.evaluate("[...document.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.trim() === 'OK').click()")
    page.wait_for_timeout(500)
    assert page.evaluate("window.formvis.engine.current.activeLayer.effects") is None or not page.evaluate("!!window.formvis.engine.current.activeLayer.effects")
    assert page.evaluate(ROUND) == [True, False]
    assert page.evaluate(PSD) == [True, False]
    page.evaluate("window.formvis.commands.run('layer-style')")
    page.wait_for_timeout(600)
    assert page.evaluate("() => ['Blend Interior Effects as Group', 'Layer Mask Hides Effects'].map((t) => [...document.querySelectorAll('label.cv-check')].find((x) => x.offsetParent && x.textContent.trim() === t).querySelector('input').checked)") == [True, False]


@steady
def test_smart_object_warp_reopens_on_the_dragged_mesh(page, tmp_path):
    start(page)
    page.evaluate(SMART)
    first, again = page.evaluate(WARP)
    assert len(first) == len(again) == 16
    assert all(abs(a[0] - b[0]) < 0.01 and abs(a[1] - b[1]) < 0.01 for a, b in zip(first, again))
