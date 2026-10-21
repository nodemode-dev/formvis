import re

SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(120, 120, 'M', 'white');
  const c = e.current.activeLayer.raster.canvas.getContext('2d');
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgb(${(i * 53) % 256},${(i * 97) % 256},${(i * 29) % 256})`; c.fillRect((i * 37) % 110, (i * 61) % 110, 18, 14); }
  c.strokeStyle = '#000'; c.lineWidth = 3;
  for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(0, k * 20 + 5); c.lineTo(120, k * 20 + 25); c.stroke(); }
  e.applySelection(E.SelectionMask.cropped(20, 20, 80, 80, new Uint8Array(6400).fill(255)), 'replace', 's');
  e.layerViaCopy(); e.deselect(); }"""
NUDGE = """() => { const e = window.formvis.engine, l = e.current.activeLayer, t = l.transform;
  e.edit('Nudge', (q) => { q.updateLayer(l.id, { transform: { ...t, x: t.x + 3, y: t.y - 2 } }); }); }"""
POS = "() => { const t = window.formvis.engine.current.activeLayer.transform; return [t.x, t.y, t.w, t.h, t.rotation]; }"


def menu(page, *path):
    if page.locator(".cv-menu:not([hidden])").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def test_match_edges_to_layer_below_moves_an_offset_copy_back_onto_the_picture_and_undoes(page):
    # SC-ED-0119
    page.evaluate(SETUP)
    page.evaluate(NUDGE)
    assert page.evaluate(POS)[:2] == [23, 18]
    menu(page, "Edit", "Match Edges to Layer Below")
    page.wait_for_function("window.formvis.engine.historySteps.names.slice(-1)[0] === 'Match Edges to Layer Below'", timeout=30000)
    x, y, w, h, rot = page.evaluate(POS)
    assert abs(x - 20) < 0.1 and abs(y - 20) < 0.1 and abs(w - 80) < 0.1 and abs(h - 80) < 0.1 and abs(rot) < 0.1, (x, y, w, h, rot)
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(POS)[:2] == [23, 18]
