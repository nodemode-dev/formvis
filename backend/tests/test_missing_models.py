"""An action whose local model is not downloaded answers 409 naming the model, so the window can offer to install it."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.localgen import model_manager
from app.main import app


def _png() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (8, 8), (120, 90, 60)).save(b, "PNG")
    return b.getvalue()


ROUTES = [
    ("/api/inpaint/local", "lama-inpaint", ("image", "mask"), {}),
    ("/api/upscale/local", "ai-upscale", ("file",), {"factor": "2"}),
    ("/api/colorize/local", "ddcolor-tiny", ("image",), {}),
    ("/api/depth/local", "depth-anything-v2-small", ("image",), {}),
    ("/api/face/landmarks", "yunet-face", ("image",), {}),
    ("/api/sky/mask", "skyseg", ("image",), {}),
    ("/api/style/local", "fast-style", ("image",), {"style": "candy"}),
    ("/api/remove/find", "yunet-face", ("image",), {"kind": "people"}),
]


@pytest.mark.parametrize("path,model,fields,data", ROUTES, ids=[r[0] for r in ROUTES])
def test_a_missing_model_is_named_in_the_answer(monkeypatch, path, model, fields, data):
    monkeypatch.setattr(model_manager, "ready", lambda _model: False)
    files = {f: (f"{f}.png", _png(), "image/png") for f in fields}
    from app.core import window_key
    r = TestClient(app, base_url="http://127.0.0.1:8190").post(path, files=files, data=data, headers={"x-formvis-local": "1", window_key.HEADER: window_key.KEY})
    assert r.status_code == 409, r.text
    assert r.headers.get("x-formvis-model") == model
    assert "Preferences > Plugins > Local models" in r.json()["detail"]


@pytest.mark.parametrize("model", sorted({r[1] for r in ROUTES}))
def test_every_model_an_action_can_ask_for_has_a_size_to_show(model):
    listed = {m["id"]: m for m in TestClient(app, base_url="http://127.0.0.1:8190").get("/api/models").json()}
    assert model in listed
    size = listed[model]["size"]
    assert isinstance(size, str) and size.split()[-1] in ("KB", "MB", "GB") and float(size.split()[0]) > 0
