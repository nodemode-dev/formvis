# D22: Auto-Align Layers with Vignette Removal answers per-layer gains for a vignetted overlapping pair, says nothing was found for clean ones, and does nothing when off.
import io

import numpy as np
from PIL import Image

H, W, SHOT = 400, 700, 420


def scene():
    rng = np.random.default_rng(3)
    base = rng.random((H // 8, W // 8, 3)).astype(np.float32)
    big = np.asarray(Image.fromarray((base * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
    return big * 0.6 + 0.3


def shot(full, x0, vig):
    crop = full[:, x0:x0 + SHOT]
    yy, xx = np.mgrid[0:H, 0:SHOT]
    r = np.hypot(xx - SHOT / 2, yy - H / 2) / np.hypot(SHOT / 2, H / 2)
    out = np.clip(crop * ((1 - vig * r ** 2)[..., None] if vig else 1), 0, 1)
    buf = io.BytesIO()
    Image.fromarray((out * 255).astype(np.uint8)).save(buf, "PNG")
    return buf.getvalue()


def align(client, vig, flag):
    full = scene()
    files = [("file", ("a.png", shot(full, 0, vig), "image/png")), ("file", ("b.png", shot(full, 280, vig), "image/png"))]
    r = client.post("/api/merge/align", files=files, data={"vignette": flag})
    assert r.status_code == 200
    return r.json()


def test_vignetted_pair_gets_gains_only_when_the_option_is_on(client):
    on = align(client, 0.5, "true")
    assert on["vignette"] == "applied"
    assert all(g is not None for g in on["gains"])
    off = align(client, 0.5, "false")
    assert off["vignette"] == "off" and all(g is None for g in off["gains"])


def test_a_clean_pair_reports_no_vignetting_and_no_gains(client):
    clean = align(client, 0.0, "true")
    assert clean["vignette"] == "no vignetting found"
    assert all(g is None for g in clean["gains"])
