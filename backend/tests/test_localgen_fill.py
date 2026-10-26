"""Local image-to-image from a picture formvis sends (1.52.9): what Generative Fill uses with Krea 2 on this computer.
A stand-in for mflux records the command it is given and writes a picture."""

import base64
import io
import json
import sys
import time

from fastapi.testclient import TestClient
from PIL import Image

from app.localgen import generate, krea2
from app.main import app


def test_a_picture_sent_starts_the_image_to_image_and_is_fetched_then_forgotten(tmp_path, monkeypatch):
    monkeypatch.setattr(krea2, "CONSENT_FILE", tmp_path / "consent.json")
    monkeypatch.setattr(krea2, "policy", lambda: {"licenceAccepted": True, "ready": True, "reason": None, "build": "mlx-q8", "filterInstalled": False, "removalAcknowledged": True})
    seen = tmp_path / "command.json"
    script = f"import json, sys; from PIL import Image; json.dump(sys.argv, open({str(seen)!r}, 'w')); Image.new('RGB', (96, 64), 'teal').save(sys.argv[1])"
    real = krea2._command

    def stand_in(build, prompt, out, width, height, seed, *rest, **kw):
        cmd = real(build, prompt, out, width, height, seed, *rest, **kw)
        image = cmd[cmd.index("--image") + 1:cmd.index("--image") + 3] if "--image" in cmd else []
        return [sys.executable, "-c", script, str(out).replace("{seed}", str(seed)), *image]
    monkeypatch.setattr(krea2, "_command", stand_in)
    src = io.BytesIO(); Image.new("RGB", (300, 200), (200, 50, 50)).save(src, "PNG")
    client = TestClient(app, base_url="http://127.0.0.1:8190")
    started = client.post("/api/generate", json={"generator": "local:krea-2", "prompt": "a lighthouse", "size": "source",
                                                  "options": {"image": {"png": base64.b64encode(src.getvalue()).decode()}, "imageStrength": 0.35}})
    assert started.status_code == 202, started.text
    for _ in range(200):
        status = client.get(f"/api/jobs/{started.json()['job_id']}").json()
        if status["status"] in ("done", "error", "failed"):
            break
        time.sleep(0.05)
    assert status["status"] == "done", status
    result = status["result"]
    args = json.loads(seen.read_text())
    assert args[-1] == "0.35" and args[-2].endswith(".png"), args                                  # the source and its influence reached the model
    assert any("influence 0.35" in n for n in result["notes"])
    assert not list((generate.STAGING).glob("source-*.png"))                                          # the staged source removed
    picture = result["media"][0]
    got = client.get(picture["url"])
    assert got.status_code == 200 and Image.open(io.BytesIO(got.content)).size == (96, 64)
    assert "parameters" in Image.open(io.BytesIO(got.content)).text                                  # its recipe written in
    client.delete(picture["url"])
    assert client.get(picture["url"]).status_code == 404


def test_a_picture_that_is_not_one_is_refused(tmp_path, monkeypatch):
    """With Krea 2 ready (before its licence is accepted it is not offered at all: 404, formcut's own test covers it)."""
    monkeypatch.setattr(krea2, "CONSENT_FILE", tmp_path / "consent.json")
    krea2.record_consent(True)
    monkeypatch.setattr(krea2, "policy", lambda: {"licenceAccepted": True, "ready": True, "reason": None, "build": "mlx-q8", "filterInstalled": False, "removalAcknowledged": True})
    r = TestClient(app, base_url="http://127.0.0.1:8190").post("/api/generate", json={"generator": "local:krea-2", "prompt": "x", "options": {"image": {"png": "not a picture"}}})
    assert r.status_code == 400 and "could not be read" in r.json()["detail"]
