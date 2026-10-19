# OpenRaster (1.51.7), checked with Python's own zip and XML readers, and a file built here as other apps write them.
import base64
import io
import xml.etree.ElementTree as ET
import zipfile

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
CAPTURE = """async () => {
  const got = new Promise((resolve) => {
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
    URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () { URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click; const name = this.download, blob = made;
      if (!blob) { resolve(null); return; } blob.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name, b64: btoa(s) }); }, () => resolve(null)); };
  });
  for (let i = 0; i < 100 && !window.formvis.commands.run('export-ora'); i++) await new Promise((r) => setTimeout(r, 100));
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 20000))]);
}"""


def png(w, h, rgba):
    b = io.BytesIO(); Image.new("RGBA", (w, h), rgba).save(b, "PNG"); return b.getvalue()


def test_export_is_a_valid_openraster_file(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'Out', 'white');
      e.addLayer(); const red = e.activeLayer; e.fg = { r: 200, g: 0, b: 0 }; e.paintBucket({ x: 1, y: 1 });
      e.current.updateLayer(red.id, { name: 'Red', opacity: 0.5, blend: 'multiply' });
      e.addLayer(); e.fg = { r: 0, g: 0, b: 200 }; e.paintBucket({ x: 1, y: 1 }); const hid = e.activeLayer.id; e.current.updateLayer(hid, { name: 'Hidden', visible: false });
      e.selectLayer(red.id); e.groupLayers();   // Red into a group, below Hidden (new layers would otherwise go inside it)
      e.selectLayer(hid); e.addAdjustmentLayer('curves'); }""")
    r = page.evaluate(CAPTURE)
    assert r and r["name"] == "Out.ora"
    z = zipfile.ZipFile(io.BytesIO(base64.b64decode(r["b64"])))
    first = z.infolist()[0]
    assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED and z.read("mimetype") == b"image/openraster"
    root = ET.fromstring(z.read("stack.xml"))
    assert (root.get("w"), root.get("h")) == ("100", "60")
    top = root.find("stack")
    names = [(e.tag, e.get("name")) for e in top]
    assert names[0] == ("layer", "Hidden") and names[-1] == ("layer", "Background"), names   # topmost first; the adjustment left out
    red = next(e for e in top.iter("layer") if e.get("name") == "Red")
    assert red.get("composite-op") == "svg:multiply" and abs(float(red.get("opacity")) - 0.5) < 1e-3
    hidden = next(e for e in top.iter("layer") if e.get("name") == "Hidden")
    assert hidden.get("visibility") == "hidden"
    groups = [g for g in top.iter("stack") if g is not top]   # iter() includes the root stack itself
    assert len(groups) == 1 and groups[0].find("layer").get("name") == "Red" and groups[0].get("isolation") == "auto", [g.attrib for g in groups]   # a pass-through group holding Red
    assert Image.open(io.BytesIO(z.read(red.get("src")))).getpixel((1, 1))[:3] == (200, 0, 0)
    assert Image.open(io.BytesIO(z.read("mergedimage.png"))).size == (100, 60) and max(Image.open(io.BytesIO(z.read("Thumbnails/thumbnail.png"))).size) <= 256
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('Adjustment layers have no OpenRaster form'))")


def test_a_file_written_as_other_apps_write_them_opens(page, tmp_path):
    stack = """<?xml version='1.0' encoding='UTF-8'?>
<image version="0.0.5" w="80" h="50" xres="72" yres="72"><stack>
  <layer name="Glow" src="data/glow.png" x="10" y="5" opacity="0.6" composite-op="svg:screen"/>
  <stack name="Scene" opacity="1" isolation="auto">
    <layer name="Odd" src="data/odd.png" x="0" y="0" composite-op="other:strange"/>
    <layer name="Sky" src="data/sky.png" x="0" y="0" visibility="hidden"/>
  </stack>
  <layer name="Paper" src="data/paper.png" x="0" y="0"/>
</stack></image>"""
    f = tmp_path / "scene.ora"
    with zipfile.ZipFile(f, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "image/openraster")                    # stored, first
        z.writestr("stack.xml", stack, compress_type=zipfile.ZIP_DEFLATED)
        for name, (w, h, c) in {"glow": (20, 10, (0, 200, 0, 255)), "odd": (80, 50, (0, 0, 0, 0)), "sky": (80, 50, (0, 0, 255, 255)), "paper": (80, 50, (255, 255, 255, 255))}.items():
            z.writestr(f"data/{name}.png", png(w, h, c), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("mergedimage.png", png(80, 50, (255, 255, 255, 255)), compress_type=zipfile.ZIP_DEFLATED)
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file][accept*='.ora']").set_input_files(str(f))
    page.wait_for_function("() => window.formvis.engine.current && window.formvis.engine.current.name === 'scene'", timeout=15000)
    got = page.evaluate("""(() => { const d = window.formvis.engine.current.doc, by = (n) => d.layers.find((l) => l.name === n);
      return { order: d.layers.map((l) => l.name), scene: by('Sky').parentId === by('Scene').id && by('Odd').parentId === by('Scene').id,
        glow: [by('Glow').blend, Math.round(by('Glow').opacity * 10) / 10, by('Glow').transform.x, by('Glow').transform.y], skyHidden: by('Sky').visible === false }; })()""")
    assert got["order"] == ["Paper", "Sky", "Odd", "Scene", "Glow"], got                  # bottom first, the group after its children
    assert got["scene"] and got["glow"] == ["screen", 0.6, 10, 5] and got["skyHidden"], got
    px = page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(15, 8, 1, 1).data).slice(0, 3)")
    assert px[1] > 120 and px[0] > 200, px                                                   # green screened over white paper
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('other:strange'))")
