# D23: the png8 encoder wrote a full-colour PNG; it writes a palette PNG of at most 256 colours with transparency kept.
# D41: Artboards to PDF carries the RGB profile as an ICCBased colour space on every page when one is sent.
import io
import os
import urllib.request
import uuid

from PIL import Image, ImageCms

BASE = f"http://127.0.0.1:{os.environ.get('FORMVIS_E2E_ENGINE_PORT', '8190')}/api/io"


def post(path, fields, files):
    bd = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{bd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, name, data in files:
        body += f'--{bd}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + data + b"\r\n"
    body += f"--{bd}--\r\n".encode()
    req = urllib.request.Request(BASE + path, data=body, headers={"Content-Type": f"multipart/form-data; boundary={bd}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), {k.lower(): v for k, v in r.headers.items()}


def png(w, h, fn):
    im = Image.new("RGBA", (w, h))
    im.putdata([fn(i % w, i // w) for i in range(w * h)])
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def test_d23_png8_is_a_palette_png_with_transparency():
    source = png(64, 64, lambda x, y: (x * 4, y * 4, (x + y) * 2, 0 if x < 8 else 255))
    out, _ = post("/encode", {"format": "png8"}, [("file", "a.png", source)])
    im = Image.open(io.BytesIO(out))
    assert im.format == "PNG" and im.mode == "P"
    assert len(im.getpalette()) // 3 <= 256
    rgba = im.convert("RGBA")
    assert rgba.getpixel((2, 30))[3] == 0 and rgba.getpixel((40, 30))[3] == 255


def test_d41_pdf_pages_carry_the_icc_profile_only_when_one_is_sent():
    pages = [("file", "1.png", png(100, 60, lambda x, y: (200, 30, 30, 255))), ("file", "2.png", png(80, 80, lambda x, y: (30, 30, 200, 255)))]
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    tagged, _ = post("/pdf-pages", {"dpi": "72"}, pages + [("icc", "p.icc", srgb)])
    plain, _ = post("/pdf-pages", {"dpi": "72"}, pages)
    assert tagged.startswith(b"%PDF") and tagged.count(b"/ICCBased") == 2
    assert plain.count(b"/ICCBased") == 0
