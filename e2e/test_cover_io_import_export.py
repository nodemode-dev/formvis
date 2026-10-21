# File import and export rows: JPEG quality kept, folder and multi-file import, data set import, notes import, brush tip from a picture, PSD layer styles and preview.
import base64
import io

import pytest
from PIL import Image

from e2e.files2_support import steady

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


def solid(path, size, colour, **kw):
    Image.new("RGB", size, colour).save(path, **kw)


def wait_doc_width(page, w):
    page.wait_for_function(f"window.formvis.engine.current && window.formvis.engine.current.doc.width === {w}", timeout=60000)


@steady
def test_pc_io_0003_jpeg_quality_is_detected_on_open_and_kept_in_the_document(page, tmp_path):
    f = tmp_path / "q80.jpg"
    solid(f, (30, 20), (10, 200, 90), quality=80)
    page.set_input_files("input[data-role='import-images']", str(f))
    wait_doc_width(page, 30)
    page.wait_for_function("window.formvis.engine.current.doc.meta && window.formvis.engine.current.doc.meta.jpegQuality > 0", timeout=20000)
    got = page.evaluate("window.formvis.engine.current.doc.meta.jpegQuality")
    assert abs(got - 80) <= 1


@steady
def test_co_0207_and_co_0225_several_pictures_and_a_folder_become_layers_in_name_order(page, tmp_path):
    folder = tmp_path / "pics"
    folder.mkdir()
    for n, c in (("p3.png", (0, 0, 250)), ("p1.png", (250, 0, 0)), ("p2.png", (0, 250, 0))):
        solid(folder / n, (20, 12), c)
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'Base', 'white')")
    page.set_input_files("input[data-role='import-folder']", str(folder))
    page.wait_for_function("window.formvis.engine.current.doc.layers.length >= 4", timeout=40000)
    names = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)")
    assert [n for n in names if n.startswith("p")] == ["p1", "p2", "p3"] or [n for n in names if n.startswith("p")] == ["p1.png", "p2.png", "p3.png"], names
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'Base2', 'white')")
    page.set_input_files("input[data-role='import-images']", [str(folder / "p1.png"), str(folder / "p2.png")])
    page.wait_for_function("window.formvis.engine.current.doc.layers.length >= 3", timeout=40000)


@steady
def test_pc_au_0046_data_sets_import_from_csv_text_by_command(page, tmp_path):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'Vars', 'white')")
    got = page.evaluate("""(() => { const e = window.formvis.engine; const n = window.formvis.commands.run('data-sets-import', { text: 'name,title\\nA,Hello\\nB,World' }); return { n, sets: (e.current.doc.dataSets || []).map((d) => d.name) }; })()""")
    assert len(got["sets"]) == 2


@steady
def test_pc_io_0112_and_pc_ui_0047_import_notes_reads_paragraphs_of_a_text_file(page, tmp_path):
    f = tmp_path / "notes.txt"
    f.write_text("First note\n\nSecond note\n\nThird note\n")
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'Notes', 'white')")
    with page.expect_file_chooser(timeout=20000) as chooser:
        page.evaluate("window.formvis.commands.run('import-notes')")
    chooser.value.set_files(str(f))
    page.wait_for_function("(window.formvis.engine.current.doc.notes || []).length === 3", timeout=20000)
    assert page.evaluate("window.formvis.engine.current.doc.notes.map((n) => n.text)") == ["First note", "Second note", "Third note"]


@steady
def test_pc_io_0117_a_picture_file_becomes_a_sampled_brush_tip(page, tmp_path):
    f = tmp_path / "CovIoTip.png"
    solid(f, (6, 6), (0, 0, 0))
    got = page.evaluate("""async (hex) => {
      const L = await import('/src/io/brush-library.ts'), D = await import('/src/engine/brush-dynamics.ts');
      const bytes = new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
      const r = await L.importAbr(window.formvis.engine, new File([bytes], 'CovIoTip.png', { type: 'image/png' }));
      const p = D.importedBrushPresets.find((x) => x.name === 'CovIoTip' || x.group === 'CovIoTip');
      const out = { added: r.added, found: !!p };
      if (p) await L.removeImportedBrush(p.id);
      return out;
    }""", f.read_bytes().hex())
    assert got["added"] == 1


@steady
def test_pc_io_0060_pc_io_0065_psd_export_carries_layer_styles_and_a_preview(page, tmp_path):
    psd_tools = pytest.importorskip("psd_tools")
    page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(80, 60, 'Styled', 'white'); e.addLayer({ name: 'Boxed' });
      e.fg = { r: 30, g: 160, b: 30 };
      e.applySelection(E.SelectionMask.cropped(10, 10, 30, 30, new Uint8Array(900).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      const fx = E.defaultEffects(); Object.assign(fx.stroke, { enabled: true, size: 3, color: { r: 0, g: 0, b: 0 } }); Object.assign(fx.dropShadow, { enabled: true, distance: 6, size: 4 });
      e.setLayerEffects(e.current.activeLayer.id, fx);
    }""")
    r = page.evaluate(CAPTURE, "export-psd")
    assert r
    psd = psd_tools.PSDImage.open(io.BytesIO(base64.b64decode(r["b64"])))
    layer = [l for l in psd.descendants() if l.name == "Boxed"][0]
    keys = {str(k) for k in layer.tagged_blocks.keys()}
    assert any("OBJECT_BASED_EFFECTS" in k or "lfx2" in k or "EFFECTS" in k for k in keys), keys
    assert "THUMBNAIL_RESOURCE" in {k.name for k in psd.image_resources.keys()} or any("THUMBNAIL" in str(k) for k in psd.image_resources.keys())
