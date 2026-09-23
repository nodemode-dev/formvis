import base64
import io

import pytest

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")
from psd_tools.psd.vector import Path  # noqa: E402

SCENE = """async () => {
  const e = window.sonny.engine;
  e.newDocument(200, 100, 'Paths', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y });
  e.setPathsOf(e.current, { list: [
    { id: 'n1', name: 'Outline', work: false, path: { subpaths: [{ closed: true, anchors: [c(20, 20), c(180, 20), { x: 100, y: 90, inX: 150, inY: 90, outX: 50, outY: 90 }] }] } },
    { id: 'w1', name: 'Work Path', work: true, path: { subpaths: [{ closed: false, anchors: [c(10, 50), c(60, 70)] }] } },
  ], active: null });
}"""
CAPTURE = """async () => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve(btoa(s)); });
    };
  });
  if (!window.sonny.commands.run('export-psd')) throw new Error('export-psd');
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 15000))]);
}"""


def knots(res):
    sub = [r for r in Path.frombytes(res.data) if type(r).__name__ in ("ClosedPath", "OpenPath")][0]
    return type(sub).__name__, [tuple(round(v, 3) for v in k.anchor) for k in sub]


def test_paths_panel_goes_to_psd_and_comes_back(page, tmp_path):
    page.evaluate(SCENE)
    data = base64.b64decode(page.evaluate(CAPTURE))
    ir = psd_tools.PSDImage.open(io.BytesIO(data)).image_resources
    assert ir[2000].name == "Outline"
    # psd-tools gives each anchor as (y, x), fractions of the document's height and width
    assert knots(ir[2000]) == ("ClosedPath", [(0.2, 0.1), (0.2, 0.9), (0.9, 0.5)])
    assert knots(ir[1025]) == ("OpenPath", [(0.5, 0.05), (0.7, 0.3)])
    f = tmp_path / "Paths.psd"
    f.write_bytes(data)
    n = page.evaluate("window.sonny.engine.projects.length")
    page.set_input_files("input[type=file][accept*='.psd']:not([data-role])", str(f))
    page.wait_for_function(f"window.sonny.engine.projects.length > {n}", timeout=15000)
    back = page.evaluate("""(() => { const e = window.sonny.engine; return e.pathsOf(e.current).list.map((p) => [p.name, p.work, p.path.subpaths[0].anchors.map((a) => [Math.round(a.x), Math.round(a.y)])]); })()""")
    assert back == [["Outline", False, [[20, 20], [180, 20], [100, 90]]], ["Work Path", True, [[10, 50], [60, 70]]]], back
