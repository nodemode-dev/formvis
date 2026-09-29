# File > Place 3D Model (1.51.9), with a .glb built here from the glTF 2.0 specification: a red cube.
import json
import struct

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def glb_cube(path):
    faces = [((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]), ((-1, 0, 0), [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)]),
             ((0, 1, 0), [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)]), ((0, -1, 0), [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)]),
             ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]), ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)])]
    pos, nor, idx = [], [], []
    for n, quad in faces:
        b = len(pos); pos += quad; nor += [n] * 4; idx += [b, b + 1, b + 2, b, b + 2, b + 3]
    p = b"".join(struct.pack("<3f", *v) for v in pos); nb = b"".join(struct.pack("<3f", *v) for v in nor); ib = struct.pack(f"<{len(idx)}H", *idx)
    ib += b"\0" * (-len(ib) % 4)
    blob = p + nb + ib
    doc = {"asset": {"version": "2.0", "generator": "formvis test"}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
           "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
           "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.05, 0.05, 1], "metallicFactor": 0, "roughnessFactor": 0.7}, "doubleSided": True}],
           "buffers": [{"byteLength": len(blob)}],
           "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(p)}, {"buffer": 0, "byteOffset": len(p), "byteLength": len(nb)}, {"buffer": 0, "byteOffset": len(p) + len(nb), "byteLength": len(idx) * 2}],
           "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": [-1, -1, -1], "max": [1, 1, 1]},
                         {"bufferView": 1, "componentType": 5126, "count": len(nor), "type": "VEC3"}, {"bufferView": 2, "componentType": 5123, "count": len(idx), "type": "SCALAR"}]}
    js = json.dumps(doc).encode(); js += b" " * (-len(js) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(blob), b"BIN\0") + blob
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def place(page, path, **view):
    page.locator("input[data-role='place-3d']").set_input_files(str(path))
    page.locator(DLG, has_text="Place 3D Model").wait_for()
    for label, v in view.items():
        page.locator(f"{DLG} input[aria-label='{label}']").evaluate("(i, v) => { i.value = String(v); i.dispatchEvent(new Event('input')); }", v)
    page.wait_for_timeout(200)
    drawn = page.evaluate("""(() => { const c = document.querySelector('.cv-scrim:not([hidden]) .cv-model3d-preview'), t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
      const x = t.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n; })()""")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Place").click()
    page.wait_for_function("() => window.formvis.engine.activeLayer && window.formvis.engine.activeLayer.name === '3D: cube'")
    layer = page.evaluate("""(() => { const l = window.formvis.engine.activeLayer, d = l.raster.ctx.getImageData(0, 0, l.raster.width, l.raster.height).data, W = l.raster.width, px = (x, y) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] * 3 + d[i + 1] * 5 + d[i + 3]; return { size: [l.raster.width, l.raster.height], centre: px(100, 75), corner: px(2, 2), sum }; })()""")
    return drawn, layer


def test_a_model_is_posed_lit_and_placed_as_a_layer(page, tmp_path):
    cube = tmp_path / "cube.glb"; glb_cube(cube)
    page.evaluate("window.formvis.engine.newDocument(200, 150, 'D', 'white')")
    drawn, lit = place(page, cube)
    assert drawn > 500, drawn                                                                          # the preview shows it
    assert lit["size"] == [200, 150] and lit["corner"][3] == 0, lit                                    # document-sized, clear around it
    r, g, b, a = lit["centre"]
    assert a == 255 and r > 60 and r > g * 2 and r > b * 2, lit["centre"]                              # the red cube, lit
    _, dark = place(page, cube, **{"Light strength": 0, "Ambient": 0})
    assert max(dark["centre"][:3]) < 20 and dark["centre"][3] == 255, dark["centre"]                   # the lights do the lighting
    _, turned = place(page, cube, Turn=75)
    assert turned["sum"] != lit["sum"], "turning changes the picture"
