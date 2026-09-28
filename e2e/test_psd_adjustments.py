import base64
import io

import pytest

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")

SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(120, 80, 'Adj', 'white');
  const c = e.current.activeLayer.raster.ctx, g = c.createLinearGradient(0, 0, 120, 0);
  g.addColorStop(0, 'rgb(30,60,200)'); g.addColorStop(1, 'rgb(240,200,40)'); c.fillStyle = g; c.fillRect(0, 0, 120, 80);
  e.current.activeLayer.raster.touch(); e.refresh();
  const bc = e.addAdjustmentLayer('brightnessContrast'), lv = e.addAdjustmentLayer('levels'), inv = e.addAdjustmentLayer('invert');
  const patch = (id, data) => e.edit('t', (p) => { const l = p.layer(id); p.updateLayer(id, { adjustment: { ...l.adjustment, data: { ...l.adjustment.data, ...data } } }); return true; });
  patch(bc, { brightness: 40, contrast: 20 });
  patch(lv, { ranges: [{ black: 20, white: 230, gamma: 1.2, outputBlack: 0, outputWhite: 255 }, {}, {}, {}] });
  if (e.current.activeLayer.id !== inv) throw new Error('the new invert layer should be active');
  e.applySelection(E.SelectionMask.cropped(0, 0, 60, 80, new Uint8Array(4800).fill(255)), 'replace', 's'); e.addMask(false); e.deselect();
}"""
CAPTURE = """async (cmd) => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  if (!window.formvis.commands.run(cmd)) throw new Error(cmd);
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 20000))]);
}"""
PX = "(() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 120, 80).data; return [0, 30, 59, 60, 90, 119].map((x) => Array.from(d.slice((40 * 120 + x) * 4, (40 * 120 + x) * 4 + 3))); })()"


def kinds(psd):
    return [layer.kind for layer in psd]


def test_adjustment_layers_go_to_psd_and_psb_and_come_back(page, tmp_path):
    page.evaluate(SCENE)
    assert page.evaluate("window.formvis.engine.current.doc.layers.filter((l) => l.adjustment).length") == 3
    assert page.evaluate("!!window.formvis.engine.current.doc.layers.find((l) => l.adjustment && l.adjustment.kind === 'invert').mask")
    before = page.evaluate(PX)
    r = page.evaluate(CAPTURE, "export-psd")
    assert r and r["name"] == "Adj.psd", r
    data = base64.b64decode(r["b64"])
    assert data[:6] == b"8BPS\x00\x01"
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    assert kinds(psd) == ["pixel", "brightnesscontrast", "levels", "invert"], kinds(psd)
    bc = list(psd)[1]
    assert (bc.brightness, bc.contrast) == (40, 20)
    assert list(psd)[3].has_mask()
    # PSB: the large-document header, the same layers
    r2 = page.evaluate(CAPTURE, "export-psb")
    assert r2 and r2["name"] == "Adj.psb", r2
    data2 = base64.b64decode(r2["b64"])
    assert data2[:6] == b"8BPS\x00\x02"
    assert kinds(psd_tools.PSDImage.open(io.BytesIO(data2))) == ["pixel", "brightnesscontrast", "levels", "invert"]
    # the PSD opens again in formvis with live adjustment layers that render the same
    f = tmp_path / "Adj.psd"
    f.write_bytes(data)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[type=file][accept*='.psd']:not([data-role])", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    got = page.evaluate("(() => { const ls = window.formvis.engine.current.doc.layers; return ls.map((l) => l.adjustment ? l.adjustment.kind + (l.mask ? '+mask' : '') : 'pixels'); })()")
    assert got == ["pixels", "brightnessContrast", "levels", "invert+mask"], got
    assert page.evaluate("window.formvis.engine.current.doc.layers[1].adjustment.data.brightness") == 40
    after = page.evaluate(PX)
    assert all(abs(a - b) <= 2 for pa, pb in zip(before, after) for a, b in zip(pa, pb)), (before, after)
