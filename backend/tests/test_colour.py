"""Colour management (1.53.5, H2) on LittleCMS: profiles, conversion and proofing tables, and the gamut warning, with a
real CMYK press profile: the FOGRA39 profile formvis ships (byte for byte TeX Live's colorprofiles copy, NOTICE.md)."""

import base64
import io

import numpy as np
import pytest
from PIL import Image, ImageCms

from app.services import colour

FOGRA = str(colour.shipped_dir() / "FOGRA39L_coated.icc")


def table(data, gamut=False):
    n = colour.GRID ** 3
    rgb = np.frombuffer(data[: n * 3], np.uint8).reshape(colour.GRID, colour.GRID, colour.GRID, 3).astype(np.float64)
    return rgb, (np.frombuffer(data[n * 3:], np.uint8).reshape(colour.GRID, colour.GRID, colour.GRID) if gamut else None)


def trilinear(t, rgb):
    """The window's lookup (engine/colour-lut.ts), in numpy: to check a 33-point table against LittleCMS itself."""
    x = np.asarray(rgb, np.float64) / 255 * (colour.GRID - 1)
    i = np.minimum(np.floor(x).astype(int), colour.GRID - 2); f = x - i
    out = 0
    for dr in (0, 1):
        for dg in (0, 1):
            for db in (0, 1):
                w = (f[:, 0] if dr else 1 - f[:, 0]) * (f[:, 1] if dg else 1 - f[:, 1]) * (f[:, 2] if db else 1 - f[:, 2])
                out = out + w[:, None] * t[i[:, 0] + dr, i[:, 1] + dg, i[:, 2] + db]
    return out


@pytest.fixture
def fogra(client, tmp_path, monkeypatch):
    monkeypatch.setattr(colour.config, "data_dir", lambda: tmp_path)
    with open(FOGRA, "rb") as f:
        r = client.post("/api/color/profiles", files={"file": ("FOGRA39L_coated.icc", f.read(), "application/vnd.iccprofile")})
    assert r.status_code == 200, r.text
    return r.json()


def test_a_press_profile_is_added_listed_and_described(client, fogra):
    assert fogra["space"] == "CMYK" and "FOGRA39" in fogra["name"].upper().replace(" ", "")
    listed = client.get("/api/color/profiles").json()["profiles"]
    assert any(p["id"] == fogra["id"] and p["added"] for p in listed)
    bad = client.post("/api/color/profiles", files={"file": ("x.icc", b"not a profile", "application/octet-stream")})
    assert bad.status_code == 422


def test_srgb_to_srgb_is_the_identity(client):
    t, _ = table(client.post("/api/color/lut", json={}).content)
    v = np.linspace(0, 255, colour.GRID)
    assert np.abs(t - np.stack(np.meshgrid(v, v, v, indexing="ij"), -1)).max() <= 1


def test_the_proof_matches_littlecms_and_marks_what_the_press_cannot_print(client, fogra):
    r = client.post("/api/color/lut", json={"proof": {"id": fogra["id"]}, "gamut": True, "proofIntent": "relative"})
    assert r.status_code == 200 and r.headers["x-gamut"] == "1"
    t, g = table(r.content, gamut=True)
    rng = np.random.default_rng(3); px = rng.integers(0, 256, (4000, 3))
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")); press = ImageCms.ImageCmsProfile(FOGRA)
    direct = ImageCms.buildProofTransform(srgb, srgb, press, "RGB", "RGB", renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                          proofRenderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=ImageCms.Flags.SOFTPROOFING | ImageCms.Flags.BLACKPOINTCOMPENSATION)
    want = np.asarray(ImageCms.applyTransform(Image.fromarray(px.astype(np.uint8).reshape(1, -1, 3), "RGB"), direct)).reshape(-1, 3)
    err = np.abs(trilinear(t, px) - want)
    assert np.percentile(err, 99) <= 3 and err.mean() < 1, (np.percentile(err, 99), err.mean())   # the 33-point table is LittleCMS's proof
    last = colour.GRID - 1
    assert g[0, 0, last] == 255 and g[0, last, 0] == 255                          # pure sRGB blue and green: beyond the press
    assert g[last // 2, last // 2, last // 2] == 0 and g[last, last, last] == 0     # mid grey and white: printable
    blue = t[0, 0, last]
    assert blue[2] < 250 and np.abs(blue - [0, 0, 255]).sum() > 30                  # proofed blue is the press's duller blue


def test_a_cmyk_source_converts_to_a_four_dimensional_table(client, fogra):
    r = client.post("/api/color/lut", json={"source": {"id": fogra["id"]}})
    assert r.status_code == 200 and r.headers["x-in"] == "4" and len(r.content) == colour.GRID4 ** 4 * 3
