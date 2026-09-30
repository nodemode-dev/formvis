"""Remove Background and Select Subject with nothing to install (1.53.4): U^2-Net on ONNX Runtime without rembg, the
real model, matching rembg's own result."""

import io

import numpy as np
from PIL import Image, ImageDraw

from app.services import background


def picture():
    im = Image.new("RGB", (400, 300), (210, 214, 220))
    ImageDraw.Draw(im).ellipse((120, 60, 280, 240), fill=(190, 50, 40))
    return im


def test_without_rembg_the_same_model_runs_on_onnx_and_finds_the_subject(monkeypatch):
    real_has = background._has
    monkeypatch.setattr(background, "_has", lambda m: False if m == "rembg" else real_has(m))
    assert background.available()["ml"] and background.available()["default"] == "ml"
    b = io.BytesIO(); picture().save(b, "PNG")
    data, used = background.remove(b.getvalue(), "auto")
    mask = np.asarray(Image.open(io.BytesIO(data))) > 127
    disc = np.asarray((lambda m: (ImageDraw.Draw(m).ellipse((120, 60, 280, 240), fill=255), m)[1])(Image.new("L", (400, 300)))) > 0
    iou = (mask & disc).sum() / (mask | disc).sum()
    assert used == "ml" and iou > 0.85, iou
    if real_has("rembg"):                                                    # where rembg is installed: the same answer
        monkeypatch.setattr(background, "_has", real_has)
        theirs = np.asarray(background._ml(picture())).astype(int)
        ours = np.asarray(background._u2net_onnx(picture())).astype(int)
        assert np.abs(theirs - ours).max() <= 2, np.abs(theirs - ours).max()


def test_at_most_two_local_models_are_held():
    """1.53.4: the four local models loaded in turn keep at most two in memory, the least recently used dropped."""
    from app.localgen import sessions
    sessions.release_all()
    for k in ("sam2", "u2net", "lama", "esrgan"):
        sessions.get(k, lambda k=k: object())
    assert sessions.held() == ["lama", "esrgan"]
    sessions.get("lama", lambda: object())                       # used again: kept, the other goes next
    sessions.get("u2net", lambda: object())
    assert sessions.held() == ["lama", "u2net"]
    sessions.release_all()


def test_models_unused_for_ten_minutes_are_released():
    """1.53.4: an idle engine gives the memory back; the next use loads the model again."""
    import time
    from app.localgen import sessions
    sessions.release_all()
    sessions.get("lama", lambda: object()); sessions.get("u2net", lambda: object())
    now = time.monotonic()
    assert sessions.release_idle(now + 60) == [] and sessions.held() == ["lama", "u2net"]
    assert sorted(sessions.release_idle(now + sessions.IDLE_SECONDS + 1)) == ["lama", "u2net"] and sessions.held() == []
