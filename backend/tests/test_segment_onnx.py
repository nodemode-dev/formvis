"""Object Selection with nothing to install (1.53.4): SAM 2.1 on ONNX Runtime, the real model, through the engine's route."""

import io
import json

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.localgen import model_manager
from app.main import app
from app.services import segment


def picture():
    im = Image.new("RGB", (480, 320), (235, 235, 230))
    ImageDraw.Draw(im).ellipse((80, 60, 240, 220), fill=(200, 40, 40))       # a red disc
    ImageDraw.Draw(im).rectangle((300, 90, 430, 250), fill=(40, 90, 200))    # a blue block
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def truth(shape):
    m = Image.new("L", (480, 320)); d = ImageDraw.Draw(m)
    d.ellipse((80, 60, 240, 220), fill=255) if shape == "disc" else d.rectangle((300, 90, 430, 250), fill=255)
    return np.asarray(m) > 0


def iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def test_the_real_model_selects_by_click_and_by_box_without_torch(monkeypatch):
    monkeypatch.setattr(segment, "torch_available", lambda: False)             # as a base install: no torch
    assert segment.available() and segment.backend() == "onnx"
    assert model_manager.ready("sam2-onnx"), "fetched by the model manager (pinned) before this test"
    client = TestClient(app)
    cap = client.get("/api/capabilities").json()
    assert cap["selectObject"]["available"] and cap["selectObject"]["device"] == "onnx"
    data = picture()
    r = client.post("/api/ops/select-object", data={"key": "t1", "points": json.dumps([[160, 140, 1]])}, files={"file": ("p.png", data, "image/png")})
    assert r.status_code == 200, r.text
    disc = np.asarray(Image.open(io.BytesIO(r.content))) > 127
    assert iou(disc, truth("disc")) > 0.9, iou(disc, truth("disc"))              # the disc, clicked
    r = client.post("/api/ops/select-object", data={"key": "t1", "points": "[]", "box": json.dumps([290, 80, 440, 260])})
    block = np.asarray(Image.open(io.BytesIO(r.content))) > 127
    assert iou(block, truth("block")) > 0.9, iou(block, truth("block"))         # the block, boxed (the image encoded once)
