# D01: a folder's opacity and blend mode survive a PSD export and reopen. D16: an .abr brush's spacing becomes the preset's spacing.
import base64
import io
import struct

import pytest

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")

SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(60, 40, 'Folder', 'white');
  e.addLayer({ name: 'Inside' });
  e.fg = { r: 200, g: 30, b: 30 };
  e.applySelection(E.SelectionMask.cropped(5, 5, 30, 20, new Uint8Array(600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  if (!window.formvis.commands.run('group')) throw new Error('group');
  const f = e.current.doc.layers.find((l) => l.isGroup);
  e.current.updateLayer(f.id, { opacity: 0.5, blend: 'multiply', isolate: true });
  e.refresh();
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
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
}"""
GROUP = "(() => { const g = window.formvis.engine.current.doc.layers.find((l) => l.isGroup); return g ? { o: Math.round(g.opacity * 100), b: g.blend } : null; })()"


def test_folder_opacity_and_blend_survive_psd_export_and_reopen(page, tmp_path):
    page.evaluate(SCENE)
    assert page.evaluate(GROUP) == {"o": 50, "b": "multiply"}
    r = page.evaluate(CAPTURE, "export-psd")
    assert r, "nothing was delivered"
    data = base64.b64decode(r["b64"])
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    groups = [g for g in psd.descendants() if g.kind == "group"]
    assert len(groups) == 1
    assert round(groups[0].opacity / 255 * 100) == 50
    assert groups[0].blend_mode.name == "MULTIPLY"
    f = tmp_path / "Folder.psd"
    f.write_bytes(data)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=30000)
    assert page.evaluate(GROUP) == {"o": 50, "b": "multiply"}


def abr_v2(spacing):
    w = h = 4
    body = b"\0\0\0\0" + struct.pack(">H", spacing) + b"\0" * 9 + struct.pack(">iiiiHB", 0, 0, h, w, 8, 0) + bytes([255]) * (w * h)
    return struct.pack(">HH", 1, 1) + struct.pack(">HI", 2, len(body)) + body


def test_abr_spacing_is_read_as_a_fraction_of_the_tip_and_reaches_the_preset(page):
    hexed = abr_v2(60).hex()
    got = page.evaluate("""async (hex) => {
      const A = await import('/src/engine/abr.ts'), L = await import('/src/io/brush-library.ts'), D = await import('/src/engine/brush-dynamics.ts');
      const bytes = new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
      const parsed = A.parseAbr(bytes.buffer, 'T');
      const e = window.formvis.engine;
      await L.importAbr(e, new File([bytes], 'Cov2Spacing.abr'));
      const p = D.importedBrushPresets.find((x) => x.group === 'Cov2Spacing');
      const out = { parsed: parsed.map((b) => b.spacing), preset: p ? p.spacing : null, id: p ? p.id : null, applied: e.brushShape.spacing };
      if (p) await L.removeImportedBrush(p.id);
      return out;
    }""", hexed)
    assert got["parsed"] == [0.6]
    assert got["id"] is not None
    assert got["preset"] == 60
    assert got["applied"] == 60
