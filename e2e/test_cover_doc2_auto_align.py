SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 200, 'M', 'white');
  const c = e.current.activeLayer.raster.canvas.getContext('2d');
  let s = 7; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgb(${r() * 255 | 0},${r() * 255 | 0},${r() * 255 | 0})`; c.fillRect(r() * 190, r() * 190, 6 + r() * 14, 6 + r() * 14); }
  e.applySelection(E.SelectionMask.cropped(30, 30, 120, 120, new Uint8Array(14400).fill(255)), 'replace', 's'); e.layerViaCopy(); e.deselect();
  const snap = () => { const o = []; for (let y = 36; y < 140; y += 4) for (let x = 36; x < 140; x += 4) { const c = e.compositePixel({ x, y }); o.push(c.r, c.g, c.b); } return o; };
  const ref = snap(), l = e.current.activeLayer, t = l.transform;
  e.edit('Nudge', (q) => { q.updateLayer(l.id, { transform: { ...t, x: t.x + 6, y: t.y - 4 } }); });
  window.__diff = () => { const b = snap(); let d = 0; for (let i = 0; i < ref.length; i++) d += Math.abs(ref[i] - b[i]); return d / ref.length; };
  e.selectAllLayers(true); }"""


def test_auto_align_layers_moves_an_offset_copy_back_so_the_picture_matches(page):
    # PC-EN-0217
    page.evaluate(SETUP)
    assert page.evaluate("window.__diff()") > 20
    r = page.evaluate("window.formvis.commands.call('auto-align-layers', { projection: 'reposition', reference: 'bottom' })")
    assert r["ran"] is True
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Auto-Align Layers'", timeout=60000)
    assert page.evaluate("window.__diff()") < 1
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.__diff()") > 20
