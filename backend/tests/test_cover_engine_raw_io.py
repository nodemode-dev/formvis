# covengine: the engine's raw tone controls, DNG gain maps, decompression-bomb refusal, and the colour and mask routes used by hand.
import base64
import io
import os
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

from app.core import config

DNG = (Path(__file__).resolve().parent / "fixtures" / "synthetic.dng").read_bytes()
W, H = 64, 48


def png_of(array):
    buf = io.BytesIO()
    Image.fromarray(array).save(buf, "PNG")
    return buf.getvalue()


def with_mosaic(dng, mosaic):
    out = bytearray(dng)
    out[464:464 + W * H * 2] = mosaic.astype("<u2").tobytes()
    return bytes(out)


def with_gain_map(dng, grid):
    pv, ph = grid.shape
    body = struct.pack(">10I", 0, 0, H, W, 0, 3, 1, 1, pv, ph) + struct.pack(">4d", 1.0 / max(1, pv - 1), 1.0 / max(1, ph - 1), 0.0, 0.0) + struct.pack(">I", 1) + grid.astype(">f4").tobytes()
    blob = struct.pack(">I", 1) + struct.pack(">4I", 9, 0x01030000, 0, len(body)) + body
    at = struct.unpack("<I", dng[4:8])[0]
    n = struct.unpack("<H", dng[at:at + 2])[0]
    entries = [dng[at + 2 + i * 12:at + 14 + i * 12] for i in range(n)]
    out = bytearray(dng)
    if len(out) % 2:
        out.append(0)
    blob_at = len(out)
    out += blob
    if len(out) % 2:
        out.append(0)
    entries.append(struct.pack("<HHII", 51009, 7, len(blob), blob_at))
    entries.sort(key=lambda e: struct.unpack("<H", e[:2])[0])
    new_at = len(out)
    out += struct.pack("<H", len(entries)) + b"".join(entries) + struct.pack("<I", 0)
    out[4:8] = struct.pack("<I", new_at)
    return bytes(out)


def decode(client, data, develop=None):
    import json
    r = client.post("/api/io/decode", files={"file": ("a.dng", data, "application/octet-stream")}, data={"develop": json.dumps(develop)} if develop else {})
    assert r.status_code == 200, r.text
    return np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB")).astype(float)


def scene():
    yy, xx = np.mgrid[0:H, 0:W]
    m = np.where(xx < 32, 250, 3000).astype(float) + ((xx // 4 + yy // 4) % 2) * np.where(xx < 32, 120, 700)
    return with_mosaic(DNG, np.clip(m, 0, 4095))


def test_raw_tone_controls_act_at_the_raw_stage(client):
    src = scene()
    base = decode(client, src)
    dark, bright = (slice(None), slice(4, 28), 1), (slice(None), slice(36, 60), 1)
    shadows = decode(client, src, {"shadows": 80})
    assert shadows[dark].mean() > base[dark].mean() + 20
    assert abs(shadows[bright].mean() - base[bright].mean()) < 6
    highlights = decode(client, src, {"highlights": -80})
    assert highlights[bright].mean() < base[bright].mean() - 25
    assert abs(highlights[dark].mean() - base[dark].mean()) < 3
    for key in ("clarity", "texture", "dehaze"):
        out = decode(client, src, {key: 100 if key != "dehaze" else 80})
        assert out[dark].std() > base[dark].std() * 1.2, key
        assert out[bright].std() >= base[bright].std() * 0.99, key
    assert decode(client, src, {"exposure": 1})[dark].mean() > base[dark].mean() + 20


def test_a_dng_gain_map_darkens_the_side_it_describes(client):
    plain = decode(client, DNG)
    shaded = decode(client, with_gain_map(DNG, np.array([[1.0, 0.25], [1.0, 0.25]])))
    assert shaded[24, 8, 0] > plain[24, 8, 0] - 20
    assert shaded[24, 56, 2] < plain[24, 56, 2] * 0.7
    assert plain[24, 30, 0] - shaded[24, 30, 0] > 10


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))


def png_declaring(width, height, rows):
    z = zlib.compressobj(9)
    body = b"".join(z.compress(b"\0" + bytes(width * 3)) for _ in range(rows)) + z.flush()
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", body) + chunk(b"IEND", b"")


def test_implausible_and_oversized_pictures_are_refused_before_decoding(client):
    post = lambda name, data: client.post("/api/io/decode", files={"file": (name, data, "image/png")})
    forged = png_declaring(14000, 14000, 14000)[:4041]
    refused = post("forged.png", forged)
    assert refused.status_code == 415 and "damaged or not a real picture" in refused.json()["detail"]
    wide = post("wide.png", png_declaring(config.MAX_SIDE + 1000, 40, 40))
    assert wide.status_code == 415 and "30,000 px" in wide.json()["detail"]
    over = post("over.png", png_declaring(config.MAX_SIDE, config.MAX_PIXELS // config.MAX_SIDE + 2, 40))
    assert over.status_code == 415
    honest = post("sparse.png", png_declaring(2000, 2000, 2000))
    assert honest.status_code == 200 and honest.headers["x-width"] == "2000"


def test_the_classical_subject_mask_keeps_the_subject_and_drops_the_background(client):
    img = np.full((240, 320, 3), (30, 60, 200), np.uint8)
    yy, xx = np.mgrid[0:240, 0:320]
    img[(xx - 160) ** 2 + (yy - 120) ** 2 < 70 ** 2] = (230, 40, 40)
    r = client.post("/api/ops/remove-background", files={"file": ("s.png", png_of(img), "image/png")}, data={"method": "lite"})
    assert r.status_code == 200 and r.headers["x-method"] == "lite"
    mask = np.asarray(Image.open(io.BytesIO(r.content)).convert("L"))
    assert mask.shape == (240, 320) and mask[120, 160] > 240 and mask[120, 220] > 240
    assert mask[5, 5] < 10 and mask[120, 20] < 10 and mask[120, 245] < 10


def test_the_quick_sky_mask_needs_no_model(client):
    img = np.zeros((300, 400, 3), np.uint8)
    img[:] = (60, 140, 50)
    img[:150] = (90, 150, 230)
    noise = np.random.default_rng(0).integers(-25, 25, img[150:].shape)
    img[150:] = np.clip(img[150:].astype(int) + noise, 0, 255)
    r = client.post("/api/sky/mask?quick=true", files={"image": ("s.png", png_of(img), "image/png")})
    assert r.status_code == 200
    mask = np.asarray(Image.open(io.BytesIO(r.content)).convert("L"))
    assert mask.shape == (300, 400) and mask[40, 200] > 240 and mask[100:140].mean() > 240 and mask[170:].mean() < 5


def test_lab_conversion_matches_the_known_lab_of_srgb_red_and_white(client):
    px = np.array([[1, 1, 1, 1], [1, 0, 0, 1], [0, 0, 0, 1]], "<f4")
    r = client.post("/api/color/convert-deep", files={"file": ("p", px.tobytes())}, data={"mode": "rgb", "width": 3, "height": 1, "dest": "id:builtin:lab", "bits": 16})
    assert r.status_code == 200 and r.headers["x-space"] == "lab"
    lab = np.frombuffer(r.content, "<f4").reshape(-1, 4)
    L, a, b = lab[:, 0] * 100, lab[:, 1] * 255 - 128, lab[:, 2] * 255 - 128
    assert abs(L[0] - 100) < 0.5 and abs(a[0]) < 1 and abs(b[0]) < 1
    assert abs(L[1] - 54.3) < 0.8 and abs(a[1] - 80.8) < 1.5 and abs(b[1] - 69.9) < 2
    assert L[2] < 0.5


def test_cmyk_proof_round_trip_clips_out_of_gamut_green_and_keeps_grey(client):
    pid = client.get("/api/color/default-cmyk").json()["profile"]["id"]
    icc = base64.b64encode(client.get(f"/api/color/profiles/{pid}").content).decode()
    rgb = np.array([[128, 128, 128, 255], [0, 255, 0, 255], [255, 255, 255, 255]], np.uint8)
    form = {"width": 3, "height": 1, "profile": icc}
    ink = client.post("/api/color/convert-pixels", files={"file": ("p", rgb.tobytes())}, data={**form, "to": "cmyk"})
    assert ink.status_code == 200 and len(ink.content) == 15
    back = client.post("/api/color/convert-pixels", files={"file": ("p", ink.content)}, data={**form, "to": "rgb"})
    out = np.frombuffer(back.content, np.uint8).reshape(-1, 4).astype(int)
    assert np.abs(out[0, :3] - 128).max() <= 3 and np.abs(out[2, :3] - 255).max() <= 2
    assert out[1, 1] < 215 and out[1, 0] > 60 and out[1, 2] > 25
