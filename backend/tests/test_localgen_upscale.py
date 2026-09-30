import io
"""Real-ESRGAN upscaling in tiles: exact where the model is, seamless where it reads around.

The model itself is a 64 MB download, so these stand in for it: a pixel-wise x4 and
a x4 that reads its neighbours, as a network's receptive field does. Tiling must
reproduce the whole-picture result for both; the second only because each tile is
read with a margin of context.
"""

import numpy as np
from app.localgen import ai_upscale, model_manager
from app.main import app
from fastapi.testclient import TestClient
from PIL import Image


def _nearest(batch: np.ndarray) -> np.ndarray:
    return batch.repeat(4, axis=2).repeat(4, axis=3)


def _blurred(batch: np.ndarray) -> np.ndarray:
    padded = np.pad(batch, ((0, 0), (0, 0), (1, 1), (1, 1)), mode="edge")
    height, width = batch.shape[2:]
    box = sum(padded[:, :, dy : dy + height, dx : dx + width] for dy in range(3) for dx in range(3)) / 9.0
    return _nearest(box)


def _picture(height=70, width=90):
    rng = np.random.default_rng(7)
    return rng.integers(0, 256, (height, width, 3), dtype=np.uint8)


def test_tiles_reproduce_a_pixelwise_model_exactly():
    picture = _picture()
    whole = ai_upscale.upscale_rgb(picture, _nearest, tile=1000)
    tiled = ai_upscale.upscale_rgb(picture, _nearest, tile=32, margin=4)
    assert tiled.shape == (280, 360, 3) and np.array_equal(tiled, whole)


def test_the_margin_hides_the_seams_of_a_model_that_reads_around():
    picture = _picture()
    whole = ai_upscale.upscale_rgb(picture, _blurred, tile=1000)
    assert np.array_equal(ai_upscale.upscale_rgb(picture, _blurred, tile=32, margin=4), whole)
    assert not np.array_equal(ai_upscale.upscale_rgb(picture, _blurred, tile=32, margin=0), whole), "without a margin the seams show"


def test_an_image_keeps_its_alpha_and_takes_the_asked_size():
    image = Image.new("RGBA", (40, 30), (200, 100, 50, 128))
    doubled = ai_upscale.upscale_image(image, 2.0, _nearest)
    assert doubled.size == (80, 60) and doubled.mode == "RGBA"
    assert doubled.getpixel((40, 30))[3] == 128


def test_ai_upscaling_waits_for_its_model(monkeypatch):
    """formvis's route (formcut's is its media library's): refused, saying why, until the model is downloaded."""
    monkeypatch.setattr(model_manager, "ready", lambda model: False)
    client = TestClient(app, base_url="http://127.0.0.1:8123", headers={"x-formvis-local": "1"})
    b = io.BytesIO(); Image.new("RGB", (10, 10)).save(b, "PNG")
    reply = client.post("/api/upscale/local", files={"file": ("p.png", b.getvalue(), "image/png")}, data={"factor": "2"})
    assert reply.status_code == 409 and "model" in reply.json()["detail"]


def test_the_model_is_pinned_to_its_published_checksum():
    assert model_manager.MODELS["ai-upscale"]["license"] == "BSD-3-Clause"
    assert model_manager.PINNED["realesrgan-x4plus.onnx"].startswith("4851ec156207")


def test_the_real_model_downloads_pinned_and_upscales_through_the_route(monkeypatch):
    """The real Real-ESRGAN, fetched by the model manager's pinned download (its SHA-256 checked), run through the
    route as a job: four times larger, the alpha kept, the colours of a flat picture kept."""
    import time
    from app.localgen import jobs
    if not model_manager.ready("ai-upscale"):
        job = model_manager.start_download("ai-upscale")
        for _ in range(1200):
            state = jobs.status(job["job_id"])
            if state["status"] in ("done", "error", "failed"):
                break
            time.sleep(0.25)
        assert state["status"] == "done", state
    assert model_manager.ready("ai-upscale")
    client = TestClient(app, base_url="http://127.0.0.1:8123", headers={"x-formvis-local": "1"})
    picture = Image.new("RGBA", (40, 24), (40, 120, 200, 255)); picture.putpixel((0, 0), (40, 120, 200, 0))
    b = io.BytesIO(); picture.save(b, "PNG")
    started = client.post("/api/upscale/local", files={"file": ("p.png", b.getvalue(), "image/png")}, data={"factor": "4"})
    assert started.status_code == 202, started.text
    for _ in range(600):
        state = client.get(f"/api/jobs/{started.json()['job_id']}").json()
        if state["status"] in ("done", "error", "failed"):
            break
        time.sleep(0.1)
    assert state["status"] == "done", state
    got = Image.open(io.BytesIO(client.get(state["result"]["media"][0]["url"]).content))
    assert got.size == (160, 96) and got.mode == "RGBA"
    r, g, bl, a = got.getpixel((80, 48))
    assert abs(r - 40) < 12 and abs(g - 120) < 12 and abs(bl - 200) < 12 and a == 255 and got.getpixel((0, 0))[3] < 128


def test_every_offered_model_download_is_pinned():
    """Nothing offered for download goes unverified (1.53.4, the capability plan's M9): every file of every model the
    model manager offers has a SHA-256 pin, and the pins are well formed."""
    import re
    for model, spec in model_manager.MODELS.items():
        for name in spec["files"]:
            pin = model_manager.PINNED.get(name) or model_manager.pin_for(name)
            assert pin and re.fullmatch(r"[0-9a-f]{64}", pin), f"{model}: {name} has no SHA-256 pin"
