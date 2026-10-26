"""Inpainting on this computer with LaMa (1.53.2): what it keeps, what it fills, and the real model filling a hole."""

import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.localgen import inpaint, model_manager
from app.main import app
from tests.conftest import need_model


def _grey(image, mask):
    return np.full((1, 3, 512, 512), 128.0, np.float32)


def test_only_the_grown_mask_is_filled_and_the_rest_kept_exactly():
    rng = np.random.default_rng(3)
    picture = Image.fromarray(rng.integers(0, 256, (90, 150, 3), dtype=np.uint8))   # not square
    hole = Image.new("L", (150, 90)); ImageDraw.Draw(hole).rectangle((60, 30, 89, 59), fill=255)
    out = inpaint.inpaint(picture, hole, _grey)
    a, b = np.asarray(out), np.asarray(picture)
    assert out.size == (150, 90)
    assert (a[45, 75] == 128).all()                                                     # inside: LaMa's
    assert (a[45, 59] == 128).all()                                                     # one pixel outside the edge: the mask grown (a 3-pixel filter here)
    assert np.array_equal(a[45, 57], b[45, 57])                                         # three outside: kept
    assert np.array_equal(a[:20], b[:20]) and np.array_equal(a[:, :50], b[:, :50])      # away from it: exactly kept


def test_it_waits_for_its_model(monkeypatch):
    monkeypatch.setattr(model_manager, "ready", lambda model: False)
    b = io.BytesIO(); Image.new("RGB", (8, 8)).save(b, "PNG")
    r = TestClient(app, base_url="http://127.0.0.1:8190").post("/api/inpaint/local", files={"image": ("i.png", b.getvalue(), "image/png"), "mask": ("m.png", b.getvalue(), "image/png")})
    assert r.status_code == 409 and "LaMa" in r.json()["detail"]


def test_the_real_lama_fills_a_hole_from_its_surroundings():
    need_model("lama-inpaint", download=True)
    picture = Image.new("RGB", (400, 240), (200, 30, 30)); ImageDraw.Draw(picture).rectangle((200, 0, 399, 239), fill=(30, 60, 200))
    hole = Image.new("L", (400, 240)); ImageDraw.Draw(hole).rectangle((60, 80, 139, 159), fill=255)   # a hole inside the red
    ImageDraw.Draw(picture).rectangle((60, 80, 139, 159), fill=(0, 0, 0))                              # what was there: gone
    client = TestClient(app, base_url="http://127.0.0.1:8190")
    pb, mb = io.BytesIO(), io.BytesIO(); picture.save(pb, "PNG"); hole.save(mb, "PNG")
    r = client.post("/api/inpaint/local", files={"image": ("i.png", pb.getvalue(), "image/png"), "mask": ("m.png", mb.getvalue(), "image/png")})
    assert r.status_code == 200, r.text
    out = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB")).astype(int)
    centre = out[110:130, 90:110].mean(axis=(0, 1))
    assert centre[0] > 150 and centre[1] < 90 and centre[2] < 90, centre                 # red, from its surroundings
    assert (out[10, 300] == (30, 60, 200)).all() and (out[200, 20] == (200, 30, 30)).all()   # the rest kept
