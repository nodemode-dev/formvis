import base64
import io

import pytest

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")
from psd_tools.psd.vector import Path  # noqa: E402

SETUP = """async () => { const e = window.formvis.engine; e.newDocument(200, 160, 'Ops', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }), sq = (x) => ({ closed: true, anchors: [c(x, 40), c(x + 80, 40), c(x + 80, 120), c(x, 120)] });
  e.setWorkPath({ subpaths: [sq(40), sq(80)] }); e.fg = { r: 0, g: 0, b: 0 }; e.setTool('pathSelect'); if (e.tool !== 'pathSelect') throw new Error('tool');
  // Where to click only once the new document's view is fitted (the next frame; 1.50.8, clicks could miss the path).
  for (let i = 0; i < 100 && !(e.current.viewport.fitted && e.current.viewport.width > 0); i++) await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
DARK = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0] < 60"
CAPTURE = """async () => {
  const got = new Promise((resolve) => {
    // The file itself, caught as it is made (the app frees its address right after the click, so fetching the address
    // afterwards could lose the race and hang; 1.50.8).
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
    URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () {
      URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click;
      const name = this.download, blob = made;
      if (!blob) { resolve(null); return; }
      blob.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve(btoa(s)); }, () => resolve(null));
    };
  });
  let ran = false;   // enabled just after the app starts (1.50.8)
  for (let i = 0; i < 100 && !(ran = window.formvis.commands.run('export-psd')); i++) await new Promise((r) => setTimeout(r, 100));
  if (!ran) throw new Error('export-psd');
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 15000))]);
}"""
# first square only at x 60, the overlap at x 100, the second only at x 140
CASES = {"Combine": [True, True, True], "Subtract": [True, False, False], "Intersect": [False, True, False], "Exclude": [True, False, True]}


def ops_bar(page):
    return page.locator(".cv-opt-group:not([hidden])").filter(has=page.get_by_role("button", name="Combine", exact=True))


@pytest.mark.parametrize("op", list(CASES))
def test_each_operation_fills_as_photoshop_does(page, op):
    s = page.evaluate(SETUP)
    page.mouse.click(s[0] + 140 * s[2], s[1] + 80 * s[2])      # choose the second square
    # The path operations' bar (it alone has Combine): the selection tools' Mode has its own Subtract and Intersect, and
    # can still be showing for a frame after the tool changes (1.50.8).
    ops_bar(page).get_by_role("button", name=op, exact=True).click()
    # Wait for the operation to be on the path before filling (1.50.7: under load the fill could run first, and every
    # region filled as if nothing had been chosen).
    if op != "Combine":
        page.wait_for_function("(op) => (window.formvis.engine.workPath?.subpaths ?? []).some((s) => s.op === op)", arg=op.lower(), timeout=5000)
    page.evaluate("window.formvis.engine.fillPath()")
    assert [page.evaluate(DARK, [x, 80]) for x in (60, 100, 140)] == CASES[op], op


def test_operations_are_saved_and_go_to_psd(page):
    s = page.evaluate(SETUP)
    page.mouse.click(s[0] + 140 * s[2], s[1] + 80 * s[2])
    ops_bar(page).get_by_role("button", name="Intersect", exact=True).click()
    # Wait for the operation to be on the path before saving (1.51.9: the same race the fill test had; under load the
    # save could run first).
    page.wait_for_function("() => (window.formvis.engine.workPath?.subpaths ?? []).some((s) => s.op === 'intersect')", timeout=5000)
    ops = page.evaluate("""async () => { const e = window.formvis.engine, io = await import('/src/io/project-io.ts');
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId, e.pathsOf(e.current)); return JSON.stringify(manifest.paths || manifest); }""")
    assert '"op":"intersect"' in ops, ops[:300]
    data = base64.b64decode(page.evaluate(CAPTURE))
    ir = psd_tools.PSDImage.open(io.BytesIO(data)).image_resources
    subs = [r for r in Path.frombytes(ir[1025].data) if type(r).__name__ in ("ClosedPath", "OpenPath")]
    assert [sp.operation for sp in subs] == [1, 3], [sp.operation for sp in subs]   # combine, then intersect
