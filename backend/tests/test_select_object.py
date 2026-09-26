import io
import json
import os
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from app.services import segment

needs_sam = pytest.mark.skipif(not segment.available(), reason="SAM 2.1 is optional: ./sonny install-ml installs torch and sam2")
U = "/api/ops/select-object"


@pytest.fixture(autouse=True)
def shared_models(monkeypatch):
    # One verified checkpoint for every test run, not one per temporary data folder.
    monkeypatch.setenv("SONNY_MODELS_DIR", os.environ.get("SONNY_MODELS_DIR") or str(Path.home() / ".cache" / "sonny-models"))


def _scene() -> tuple[bytes, object, object]:
    import numpy as np

    img = Image.new("RGB", (320, 240), (128, 128, 128))
    d = ImageDraw.Draw(img)
    d.ellipse((30, 70, 130, 170), fill=(220, 40, 40))
    d.rectangle((195, 75, 285, 165), fill=(40, 60, 220))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    yy, xx = np.mgrid[0:240, 0:320]
    return buf.getvalue(), (xx - 80) ** 2 + (yy - 120) ** 2 <= 50 ** 2, (xx >= 195) & (xx <= 285) & (yy >= 75) & (yy <= 165)


def _mask(r):
    import numpy as np

    return np.array(Image.open(io.BytesIO(r.content))) > 127


@needs_sam
def test_the_engine_reports_sam(client):
    so = client.get("/api/capabilities").json()["selectObject"]
    assert so["available"] is True and so["model"] == "SAM 2.1 tiny" and so["device"] in ("cpu", "cuda", "mps"), so


@needs_sam
def test_a_click_selects_the_object_under_it_and_only_that(client):
    png, circle, square = _scene()
    first = client.post(U, data={"key": "doc:1", "points": json.dumps([[80, 120, 1]])}, files={"file": ("l.png", png, "image/png")})
    assert first.status_code == 200
    m = _mask(first)
    assert m[circle].mean() > 0.95 and m[square].mean() < 0.02 and m[~circle & ~square].mean() < 0.02
    # The second click is answered from the kept encoding: no image sent.
    second = client.post(U, data={"key": "doc:1", "points": json.dumps([[240, 120, 1]])})
    assert second.status_code == 200
    m = _mask(second)
    assert m[square].mean() > 0.95 and m[circle].mean() < 0.02


@needs_sam
def test_an_unknown_key_asks_for_the_image_and_bad_points_are_refused(client):
    assert client.post(U, data={"key": "never-sent", "points": json.dumps([[1, 1, 1]])}).status_code == 409
    png, _, _ = _scene()
    assert client.post(U, data={"key": "k", "points": "not json"}, files={"file": ("l.png", png, "image/png")}).status_code == 422


def test_without_the_extras_the_engine_says_so(client, monkeypatch):
    monkeypatch.setattr(segment, "available", lambda: False)
    r = client.post(U, data={"key": "k", "points": json.dumps([[1, 1, 1]])})
    assert r.status_code == 501 and "install-ml" in r.json()["detail"]
    assert client.get("/api/capabilities").json()["selectObject"]["available"] is False
