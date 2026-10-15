"""A filter on a giant layer kept in tiles (1.62.7, DEV_PLAN 26.6e). On a 20,000 by 6,000 document (120 MP, past the
default single-canvas limit), a Gaussian Blur runs in place a band at a time and equals, around a painted rectangle,
the same blur run directly on the same pixels; its undo is kept on the engine's disk as it goes (the step streamed,
little held in memory); a stroke tried while it runs waits; undo and redo stream back exactly; closing the document
empties the store of it. Needs the engine (the store), and skips without it."""
import os
import urllib.request

import pytest

def _engine_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8190/api/version", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def _store() -> str:
    """The engine's undo folder, asked of the engine (/api/capabilities dataDir) rather than assumed."""
    import json
    with urllib.request.urlopen("http://127.0.0.1:8190/api/capabilities", timeout=5) as r:
        return os.path.join(json.load(r)["dataDir"], "undo")


def _stored() -> int:
    store = _store()
    return len(os.listdir(store)) if os.path.isdir(store) else 0


def test_a_blur_on_a_giant_layer_is_exact_its_undo_streams_from_disk_and_edits_wait(page):
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (the store)")
    page.wait_for_function("window.formvis.engine.undoStore", timeout=30000)
    stored0 = _stored()
    r = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), F = await import('/src/ui/panels/filter-panel.ts'), e = window.formvis.engine, notes = [];
      e.on('notice', (n) => notes.push(n.text));
      const hash = (d) => { const u = new Uint32Array(d.buffer); let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; };
      (await import('/src/engine/types.ts')).setPixelBudget(100_000_000);   // 120 MP is giant only on the smallest budget; a larger machine's would keep it whole
      e.newDocument(20000, 6000, 'Giant', 'white'); const t = e.current.doc.layers[0].tiled;
      const paint = (c) => { c.fillStyle = '#2050c0'; c.fillRect(1500, 1500, 2600, 1300); };   // across the 2,048 and 4,096 edges
      t.drawOn(1500, 1500, 2600, 1300, paint);
      const s = { ...F.defaultFilterSettings(), radius: 6 }, run = (src) => F.runFilter('gaussianBlur', s, 7, src, 1), A = F.bandApron('gaussianBlur', s);
      const X = 1000, Y = 1000, RW = 3600, RH = 2300;                                     // the region compared, far from the edges
      const original = hash(t.read(X, Y, RW, RH).data);
      // The reference: the same blur run directly on the same pixels, with the apron's margin around the region.
      const m = A + 2, ref = E.createSurface(RW + 2 * m, RH + 2 * m), rc = E.ctxOf(ref);
      rc.fillStyle = '#ffffff'; rc.fillRect(0, 0, RW + 2 * m, RH + 2 * m); rc.translate(m - X, m - Y); paint(rc);
      const full = run(rc.getImageData(0, 0, RW + 2 * m, RH + 2 * m)), want = new ImageData(RW, RH);
      for (let y = 0; y < RH; y++) want.data.set(full.data.subarray(((y + m) * (RW + 2 * m) + m) * 4, ((y + m) * (RW + 2 * m) + m + RW) * 4), y * RW * 4);
      // The filter, and a stroke tried while it runs.
      const job = e.bandedFilterTiled('Gaussian Blur', run, A);
      e.setTool('brush'); const strokeBegan = e.beginStroke({ x: 10000, y: 3000 }, false);
      const ran = await job;
      const blurred = hash(t.read(X, Y, RW, RH).data), step = e.current.history.peekUndo();
      const out = { ran, strokeBegan, waitNote: notes.find((n) => n.startsWith('Wait for Gaussian Blur')) ?? '', exact: blurred === hash(want.data),
        streamed: !!step && !!step.streamed, patches: step ? step.patches.length : 0, onDisk: step ? step.patches.every((q) => !!q.disk) : false,
        heldKB: Math.round(e.current.history.retained(e.current.snapshot()) / 1024) };
      const settle = async (n) => { for (let i = 0; i < 300 && (e.draining || e.current.history.steps.current !== n); i++) await new Promise((r) => setTimeout(r, 30)); };
      const n = e.current.history.steps.current;
      e.undo(); await settle(n - 1); out.undone = hash(t.read(X, Y, RW, RH).data) === original;
      e.redo(); await settle(n); out.redone = hash(t.read(X, Y, RW, RH).data) === blurred;
      return out;
    }""")
    assert r["ran"] is True and r["exact"], r                                # equal to the blur on the same pixels
    assert r["strokeBegan"] is False and r["waitNote"], r                    # edits wait while it runs
    assert r["streamed"] and r["patches"] > 0 and r["onDisk"], r             # its undo on disk, applied a tile at a time
    assert r["heldKB"] < 64, r                                               # little of it held in memory
    assert r["undone"] and r["redone"], r
    assert _stored() - stored0 >= 2 * r["patches"], (stored0, _stored())    # both sides of every changed tile stored
    page.evaluate("() => { const e = window.formvis.engine; e.closeProject(e.current.id); }")
    # The drops are one request per stored side (about 500 here), sent without waiting; give them time to arrive
    # (a page closed at once abandons them, and the engine empties its store when it next starts).
    for _ in range(60):
        if _stored() <= stored0:
            break
        page.wait_for_timeout(500)
    assert _stored() <= stored0, (stored0, _stored())                        # closing emptied the store of them
