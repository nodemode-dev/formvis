"""Every page of a TIFF, and BigTIFF (1.53.4)."""

import io

from PIL import Image


def tiff(big=False):
    pages = [Image.new("RGB", (640, 480), "red"), Image.new("RGB", (640, 480), "green"), Image.new("RGB", (80, 60), "blue")]   # the last a thumbnail
    b = io.BytesIO(); pages[0].save(b, "TIFF", save_all=True, append_images=pages[1:], **({"big_tiff": True} if big else {})); return b.getvalue()


def test_every_page_is_listed_and_decoded_in_tiff_and_bigtiff(client):
    for big in (False, True):
        data = tiff(big)
        assert data[:4] == (b"II+\x00" if big else b"II*\x00")
        pages = client.post("/api/io/pages", files={"file": ("scan.tif", data, "image/tiff")}).json()["pages"]
        assert [(p["index"], p["width"], p["height"]) for p in pages] == [(0, 640, 480), (1, 640, 480), (2, 80, 60)]
        r = client.post("/api/io/decode", files={"file": ("scan.tif", data, "image/tiff")}, data={"page": "1"})
        assert r.status_code == 200 and Image.open(io.BytesIO(r.content)).convert("RGB").getpixel((5, 5)) == (0, 128, 0)   # the second page
        assert client.post("/api/io/decode", files={"file": ("scan.tif", data, "image/tiff")}, data={"page": "3"}).status_code == 415
    one = io.BytesIO(); Image.new("RGB", (10, 10)).save(one, "PNG")
    assert len(client.post("/api/io/pages", files={"file": ("x.png", one.getvalue(), "image/png")}).json()["pages"]) == 1
