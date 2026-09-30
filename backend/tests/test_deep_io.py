"""16-bit pixels in and out (1.53.6, the parity plan's H1): OpenCV reads and writes 16-bit PNG and TIFF losslessly."""

import cv2
import numpy as np


def gradient():
    g = np.linspace(0, 65535, 300 * 3).reshape(1, 300, 3).repeat(4, 0).astype(np.uint16)
    return g


def test_16_bit_png_and_tiff_round_trip_losslessly(client):
    rgb = gradient()
    for ext, fmt in ((".png", "png"), (".tif", "tiff")):
        ok, enc = cv2.imencode(ext, cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        r = client.post("/api/io/decode-deep", files={"file": ("g" + ext, enc.tobytes(), "application/octet-stream")})
        assert r.status_code == 200 and r.headers["x-depth"] == "16", r.text
        w, h = int(r.headers["x-width"]), int(r.headers["x-height"])
        px = np.frombuffer(r.content, "<u2").reshape(h, w, 4)
        assert (px[..., :3] == rgb).all() and (px[..., 3] == 65535).all()
        back = client.post("/api/io/encode-deep", files={"file": ("p.raw", r.content, "application/octet-stream")}, data={"width": w, "height": h, "format": fmt})
        img = cv2.imdecode(np.frombuffer(back.content, np.uint8), cv2.IMREAD_UNCHANGED)
        assert img.dtype == np.uint16 and (cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA) == px).all()
        assert len(np.unique(img)) > 800


def test_8_bit_is_widened_and_a_wrong_size_refused(client):
    ok, enc = cv2.imencode(".png", np.full((2, 2, 3), 128, np.uint8))
    r = client.post("/api/io/decode-deep", files={"file": ("e.png", enc.tobytes(), "image/png")})
    assert r.headers["x-depth"] == "8" and np.frombuffer(r.content, "<u2")[0] == 128 * 257
    bad = client.post("/api/io/encode-deep", files={"file": ("p.raw", b"\0" * 10, "application/octet-stream")}, data={"width": 2, "height": 2, "format": "png"})
    assert bad.status_code == 422
