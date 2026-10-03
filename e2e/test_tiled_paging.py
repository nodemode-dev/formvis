"""A giant document's tiles on the engine's disk (1.62.4, DEV_PLAN 26.6c). With the tiles' share set to four tiles, twelve
tiles of distinct patterns are written into a 600 MP document: four stay in memory, eight go to the store with
previews kept; a tile on disk refuses to be read as empty; the view brings a tile back and then shows its pixels
exactly; ensure brings tiles back for reading; closing the document empties the store of its tiles. Needs the engine
(the store), and skips without it."""
import os
import urllib.request

import pytest

STORE = "/tmp/formvisdata/undo"


def _engine_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8190/api/version", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def _stored() -> int:
    return len(os.listdir(STORE)) if os.path.isdir(STORE) else 0


def test_tiles_past_their_share_go_to_disk_and_come_back_exactly(page):
    if not _engine_up() or os.environ.get("FORMVIS_DATA_DIR", "/tmp/formvisdata") != "/tmp/formvisdata":
        pytest.skip("needs the engine on 8190 with its data in /tmp/formvisdata (the store)")
    page.wait_for_function("window.formvis.engine.undoStore", timeout=30000)
    before = _stored()
    r = page.evaluate("""async () => {
      const e = window.formvis.engine, S = 2048;
      e.newDocument(30000, 20000, 'Giant', 'white'); const t = e.current.doc.layers[0].tiled;
      e.tileShareOverride = 4 * S * S * 4;                                   // four tiles
      const hash = (d) => { const u = new Uint32Array(d.buffer); let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; };
      const want = [];
      for (let k = 0; k < 12; k++) {
        const img = new ImageData(S, S); let s = 1000 + k;
        for (let i = 0; i < img.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; img.data[i] = s & 255; img.data[i + 1] = (s >> 8) & 255; img.data[i + 2] = k * 20; img.data[i + 3] = 255; }
        want.push(hash(img.data));
        t.write(img, (k % 6) * S, Math.floor(k / 6) * S);
        await e.pageTiles();
      }
      const out = { resident: t.residentBytes / (S * S * 4), paged: t.pagedCount, previewsMB: (t.bytes - t.residentBytes) / 1048576 };
      try { t.read(0, 0, 8, 8); out.readPaged = 'read as empty: WRONG'; } catch (err) { out.readPaged = String(err.message || err); }
      window.__t = t; window.__want = want; window.__hash = hash;
      return out;
    }""")
    assert r["resident"] == 4 and r["paged"] == 8, r                     # the share holds four; the rest on disk
    assert r["previewsMB"] < 1, r                                         # eight previews of 128 by 128
    assert "on disk" in r["readPaged"], r                                 # never read as empty
    assert _stored() - before >= 8, (before, _stored())

    # The view over tile 0 (the least recently used, so on disk): its preview first, then the tile itself, exactly.
    r = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine, t = window.__t, S = 2048;
      const s = E.createSurface(S, S), c = E.ctxOf(s);
      e.compose(s, [1, 0, 0, 1, 0, 0], 'high');                             // asks for tile 0
      for (let i = 0; i < 100 && t.pagedCount === 8; i++) await new Promise((r) => setTimeout(r, 50));
      e.compose(s, [1, 0, 0, 1, 0, 0], 'high');
      const shown = window.__hash(c.getImageData(0, 0, S, S).data);
      await t.ensure(5 * S, S, S, S, e.undoStore);                         // tile 11, also on disk
      const read = window.__hash(t.read(5 * S, S, S, S).data);
      return { pagedAfter: t.pagedCount, shownExact: shown === window.__want[0], readExact: read === window.__want[11] };
    }""")
    assert r["pagedAfter"] <= 7, r                                         # tile 0 came back when the view asked
    assert r["shownExact"] and r["readExact"], r                          # and every byte as written

    page.evaluate("() => { const e = window.formvis.engine; e.closeProject(e.current.id); }")
    page.wait_for_timeout(1500)
    assert _stored() <= before, (before, _stored())                       # closing emptied the store of its tiles
