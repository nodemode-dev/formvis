import base64
import io

import pytest

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")
from psd_tools.psd.vector import Path  # noqa: E402

SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'Ops', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }), sq = (x) => ({ closed: true, anchors: [c(x, 40), c(x + 80, 40), c(x + 80, 120), c(x, 120)] });
  e.setWorkPath({ subpaths: [sq(40), sq(80)] }); e.fg = { r: 0, g: 0, b: 0 }; e.setTool('pathSelect'); if (e.tool !== 'pathSelect') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
DARK = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0] < 60"
CAPTURE = """async () => {
  const got = new Promise((resolve) => { const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { HTMLAnchorElement.prototype.click = orig;
    fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve(btoa(s)); }); }; });
  if (!window.formvis.commands.run('export-psd')) throw new Error('export-psd');
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 15000))]);
}"""
# first square only at x 60, the overlap at x 100, the second only at x 140
CASES = {"Combine": [True, True, True], "Subtract": [True, False, False], "Intersect": [False, True, False], "Exclude": [True, False, True]}


@pytest.mark.parametrize("op", list(CASES))
def test_each_operation_fills_as_photoshop_does(page, op):
    s = page.evaluate(SETUP)
    page.mouse.click(s[0] + 140 * s[2], s[1] + 80 * s[2])      # choose the second square
    page.locator(".cv-opt-group:not([hidden])").get_by_role("button", name=op, exact=True).click()
    page.evaluate("window.formvis.engine.fillPath()")
    assert [page.evaluate(DARK, [x, 80]) for x in (60, 100, 140)] == CASES[op], op


def test_operations_are_saved_and_go_to_psd(page):
    s = page.evaluate(SETUP)
    page.mouse.click(s[0] + 140 * s[2], s[1] + 80 * s[2])
    page.locator(".cv-opt-group:not([hidden])").get_by_role("button", name="Intersect", exact=True).click()
    ops = page.evaluate("""async () => { const e = window.formvis.engine, io = await import('/src/io/project-io.ts');
      const { manifest, files } = await io.serialize(e.current.doc, e.current.activeId, e.pathsOf(e.current)); return JSON.stringify(manifest.paths || manifest); }""")
    assert '"op":"intersect"' in ops, ops[:300]
    data = base64.b64decode(page.evaluate(CAPTURE))
    ir = psd_tools.PSDImage.open(io.BytesIO(data)).image_resources
    subs = [r for r in Path.frombytes(ir[1025].data) if type(r).__name__ in ("ClosedPath", "OpenPath")]
    assert [sp.operation for sp in subs] == [1, 3], [sp.operation for sp in subs]   # combine, then intersect
