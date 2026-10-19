import base64
import io

import pytest

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")
ALPHA = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[3]"
CAPTURE = """async () => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve(btoa(s)); });
    };
  });
  if (!window.formvis.commands.run('export-psd')) throw new Error('export-psd');
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 15000))]);
}"""


def test_a_custom_ring_keeps_its_hole_on_canvas_and_through_psd(page, tmp_path):
    s = page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 160, 'Shapes', 'transparent'); e.setTool('shape'); if (e.tool !== 'shape') throw new Error('tool');
      const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }""")
    bar = page.locator(".cv-opt-group:not([hidden]), .cv-opt-pop")
    bar.get_by_role("button", name="Custom").click()
    page.locator(".cv-opt-more").click()
    sel = bar.locator("select").filter(has=page.locator("option[value='ring']"))
    sel.select_option("ring")
    assert page.evaluate("[window.formvis.engine.shapeSettings.kind, window.formvis.engine.shapeSettings.custom]") == ["custom", "ring"]
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40, 20)); page.mouse.down(); page.mouse.move(*at(160, 140), steps=6); page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate("window.formvis.engine.current.activeLayer.name") == "Ring 1"
    # 120 px ring: band at radius 55 (46/100 of 120 is 55.2 outer), hole inside radius 33
    assert page.evaluate(ALPHA, [100, 80]) == 0 and page.evaluate(ALPHA, [100 + 45, 80]) > 200
    data = base64.b64decode(page.evaluate(CAPTURE))
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    ring = [l for l in psd if l.name == "Ring 1"][0]
    ops = [sp.operation for sp in ring.vector_mask.paths]
    assert ops == [1, 2], ops    # PSD numbers: 1 combine, 2 subtract
    f = tmp_path / "Shapes.psd"
    f.write_bytes(data)
    n = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {n}", timeout=15000)
    assert page.evaluate("!!window.formvis.engine.current.doc.layers.find((l) => l.name === 'Ring 1' && l.vector)")
    assert page.evaluate(ALPHA, [100, 80]) == 0 and page.evaluate(ALPHA, [145, 80]) > 200


def test_each_shape_kind_shows_its_own_options(page):
    # The bar is built once; each kind's rows are shown or hidden in place (Sides, Points and the rest were
    # unreachable before 0.94.0, when only the startup kind's rows existed).
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(100, 100, 'O', 'transparent'); e.setTool('shape'); })()")
    bar = page.locator(".cv-opt-group:not([hidden])")
    # rows actually on screen (a row can lack the hidden attribute's effect if CSS overrides it, as it once did)
    shown = lambda: page.evaluate("(document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click(), [...document.querySelectorAll('.cv-opt-group:not([hidden]) .cv-opt, .cv-opt-pop:not([hidden]) .cv-opt')]).filter((x) => x.offsetParent !== null && getComputedStyle(x).display !== 'none').map((x) => (x.querySelector('span') || x).textContent.trim()).filter(Boolean)")
    expect = {"Rectangle": ["Corner radius"], "Polygon": ["Corner radius", "Sides"], "Star": ["Corner radius", "Points", "Indent"], "Line": ["Weight"], "Arrow": ["Weight", "Head length", "Head width"], "Custom": ["Custom shape"], "Heart": []}
    kind_rows = {"Corner radius", "Sides", "Points", "Indent", "Weight", "Head length", "Head width", "Custom shape"}
    for kind, rows in expect.items():
        bar.get_by_role("button", name=kind, exact=True).click()
        page.wait_for_timeout(100)
        got = [r for r in shown() if r in kind_rows]
        assert got == rows, (kind, got)
