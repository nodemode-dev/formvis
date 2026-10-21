import base64
import functools
import io
import struct
import zipfile

from PIL import Image
from playwright.sync_api import Error as PlaywrightError

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
TILE = 64 * 64


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path):
        for attempt in range(3):
            try:
                return fn(page, tmp_path)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def png(w, h, rgba):
    b = io.BytesIO()
    Image.new("RGBA", (w, h), rgba).save(b, "PNG")
    return b.getvalue()


def lzf_literals(raw):
    out = bytearray()
    for i in range(0, len(raw), 32):
        chunk = raw[i:i + 32]
        out.append(len(chunk) - 1)
        out += chunk
    return bytes(out)


def tile_planes(rgba, bytes_per=1):
    r, g, b, a = rgba
    if bytes_per == 1:
        return bytes([b]) * TILE + bytes([g]) * TILE + bytes([r]) * TILE + bytes([a]) * TILE
    two = lambda v: struct.pack("<H", v * 257) * TILE
    return two(b) + two(g) + two(r) + two(a)


def layer_file(tiles, pixel_size=4, compress=False):
    head = f"VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE {pixel_size}\nDATA {len(tiles)}\n".encode()
    body = b""
    for x, y, raw in tiles:
        payload = b"\x01" + lzf_literals(raw) if compress else b"\x00" + raw
        body += f"{x},{y},LZF,{len(payload)}\n".encode() + payload
    return head + body


def kra(path, layers_xml, files, colorspace="RGBA", name="Scene", w=100, h=80):
    xml = f'<?xml version="1.0" encoding="UTF-8"?><DOC><IMAGE name="{name}" width="{w}" height="{h}" x-res="72" y-res="72" colorspacename="{colorspace}"><layers>{layers_xml}</layers></IMAGE></DOC>'
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/x-krita")
        z.writestr("maindoc.xml", xml, compress_type=zipfile.ZIP_DEFLATED)
        for n, data in files.items():
            z.writestr(f"{name}/layers/{n}", data, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("mergedimage.png", png(w, h, (10, 200, 30, 255)), compress_type=zipfile.ZIP_DEFLATED)


def open_file(page, path, name):
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(path))
    page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.name === n", arg=name, timeout=20000)


INSPECT = """() => { const d = window.formvis.engine.current.doc, flat = window.formvis.engine.flattened(), px = (x, y) => Array.from(flat.getContext('2d').getImageData(x, y, 1, 1).data);
  return { w: d.width, h: d.height, layers: d.layers.map((l) => ({ name: l.name, blend: l.blend, opacity: Math.round(l.opacity * 1000) / 1000, visible: l.visible !== false, group: !!l.isGroup, parent: l.parentId || null, id: l.id, x: l.transform ? l.transform.x : null, y: l.transform ? l.transform.y : null })),
    px: { a: px(5, 5), b: px(35, 25), c: px(90, 70) } }; }"""


@steady
def test_kra_layers_names_blend_opacity_visibility_and_pixels(page, tmp_path):
    red = tile_planes((255, 0, 0, 255))
    blue = tile_planes((0, 0, 255, 255))
    grn16 = tile_planes((0, 255, 0, 255), 2)
    layers = (
        '<layer nodetype="paintlayer" name="Top green" filename="layer3" compositeop="normal" opacity="255" visible="1" x="60" y="40" colorspacename="RGBA16"/>'
        '<layer nodetype="grouplayer" name="Box" opacity="255" visible="1"><layers>'
        '<layer nodetype="paintlayer" name="Red mult" filename="layer2" compositeop="multiply" opacity="128" visible="1" x="20" y="10" colorspacename="RGBA"/>'
        '</layers></layer>'
        '<layer nodetype="paintlayer" name="Hidden" filename="layer4" compositeop="screen" opacity="255" visible="0" x="0" y="0" colorspacename="RGBA"/>'
        '<layer nodetype="paintlayer" name="Paper" filename="layer1" compositeop="normal" opacity="255" visible="1" x="0" y="0" colorspacename="RGBA"/>'
        '<layer nodetype="vectorlayer" name="Vec" filename="layer9" visible="1"/>'
    )
    f = tmp_path / "scene.kra"
    kra(f, layers, {"layer1": layer_file([(0, 0, blue), (64, 0, blue), (0, 64, blue), (64, 64, blue)], compress=True), "layer2": layer_file([(0, 0, red)]),
                    "layer3": layer_file([(0, 0, grn16)], pixel_size=8), "layer4": layer_file([(0, 0, red)])})
    open_file(page, f, "scene")
    got = page.evaluate(INSPECT)
    by = {l["name"]: l for l in got["layers"]}
    assert [l["name"] for l in got["layers"]] == ["Paper", "Hidden", "Red mult", "Box", "Top green"], got["layers"]
    assert got["w"] == 100 and got["h"] == 80
    assert by["Red mult"]["blend"] == "multiply" and abs(by["Red mult"]["opacity"] - 128 / 255) < 0.005
    assert by["Red mult"]["parent"] == by["Box"]["id"] and by["Box"]["group"]
    assert by["Hidden"]["visible"] is False and by["Hidden"]["blend"] == "screen"
    assert (by["Red mult"]["x"], by["Red mult"]["y"]) == (20, 10) and (by["Top green"]["x"], by["Top green"]["y"]) == (60, 40)
    assert got["px"]["a"][:3] == [0, 0, 255]
    mult = got["px"]["b"]
    assert mult[2] < 140 and mult[0] < 140 and mult[1] < 30, mult
    assert got["px"]["c"][:3] == [0, 255, 0]
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('vector'))", timeout=5000)
    assert "16-bit" in page.evaluate("[...document.querySelectorAll('.cv-toast')].map((t) => t.textContent).join(' ')")


@steady
def test_kra_other_colour_space_opens_as_its_merged_image(page, tmp_path):
    f = tmp_path / "gray.kra"
    kra(f, '<layer nodetype="paintlayer" name="G" filename="layer1" colorspacename="GRAYA" opacity="255" visible="1"/>', {"layer1": layer_file([(0, 0, bytes(TILE * 2))], pixel_size=2)}, colorspace="GRAYA", name="Gray")
    open_file(page, f, "gray")
    got = page.evaluate(INSPECT)
    assert [l["name"] for l in got["layers"]] == ["Background"] and got["px"]["a"][:3] == [10, 200, 30], got
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('merged image'))", timeout=5000)


@steady
def test_kra_damaged_package_is_refused_with_a_toast(page, tmp_path):
    f = tmp_path / "broken.kra"
    with zipfile.ZipFile(f, "w") as z:
        z.writestr("maindoc.xml", "<DOC><IMAGE")
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(f))
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('broken.kra'))", timeout=15000)


def pdn_bytes(w, h, thumb_png, body=b"\x00\x01garbage"):
    import xml.sax.saxutils as sx
    head = f'<pdnImage width="{w}" height="{h}" layers="1" savedWith="4.0"><thumb png="{base64.b64encode(thumb_png).decode()}" /></pdnImage>'.encode()
    return b"PDN3" + struct.pack("<I", len(head))[:3] + head + body


@steady
def test_pdn_unreadable_layer_stream_opens_as_its_thumbnail(page, tmp_path):
    f = tmp_path / "paint.pdn"
    f.write_bytes(pdn_bytes(40, 30, png(40, 30, (200, 20, 20, 255))))
    open_file(page, f, "paint")
    got = page.evaluate(INSPECT)
    assert got["w"] == 40 and got["h"] == 30 and [l["name"] for l in got["layers"]] == ["Background"]
    assert got["px"]["a"][:3] == [200, 20, 20]
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('thumbnail'))", timeout=5000)


@steady
def test_pdn_without_magic_or_thumbnail_is_refused(page, tmp_path):
    bad = tmp_path / "notpdn.pdn"
    bad.write_bytes(b"NOPE" + bytes(40))
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(bad))
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('not a Paint.NET file'))", timeout=15000)
    nothumb = tmp_path / "nothumb.pdn"
    head = b'<pdnImage width="10" height="10" layers="1"></pdnImage>'
    nothumb.write_bytes(b"PDN3" + struct.pack("<I", len(head))[:3] + head + b"\x00\x01xx")
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(nothumb))
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('no thumbnail'))", timeout=15000)
