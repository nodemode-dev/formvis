"""Merge routes (Merge to HDR, Photomerge guards, Auto-Align, Auto-Blend) run on synthetic photos, and the system routes
(capabilities, metrics, spelling, fonts). The responses are decoded the way the window decodes them."""

import io
import json

import numpy as np
from PIL import Image


def _png(arr) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr.astype(np.uint8)).save(buf, "PNG")
    return buf.getvalue()


def _scene(w=96, h=72, seed=3):
    rng = np.random.default_rng(seed)
    base = rng.random((h // 8 + 1, w // 8 + 1))
    big = np.kron(base, np.ones((8, 8)))[:h, :w]
    return np.clip(big * 0.8 + np.linspace(0.05, 0.2, w)[None, :], 0, 1)


def _exposure(scene, gain):
    g = np.clip(scene * gain, 0, 1) ** (1 / 2.2)
    return np.stack([g, g * 0.9, g * 0.8], axis=-1) * 255


def test_merge_to_hdr_returns_a_float_image_with_its_header(client):
    scene = _scene()
    files = [("file", (f"e{i}.png", _png(_exposure(scene, g)), "image/png")) for i, g in enumerate([0.4, 1.0, 2.5])]
    r = client.post("/api/merge/hdr", data={"align": "false", "times": "0.25,1,4"}, files=files)
    assert r.status_code == 200
    n = int.from_bytes(r.content[:4], "little")
    head = json.loads(r.content[4:4 + n])
    assert (head["width"], head["height"]) == (96, 72) and head["times"] == [0.25, 1.0, 4.0]
    px = np.frombuffer(r.content[4 + n:], "<f4")
    assert px.size == 96 * 72 * 3 and np.isfinite(px).all() and px.max() > px.min() > -1e-3


def test_merge_to_hdr_needs_two_exposures(client):
    r = client.post("/api/merge/hdr", files=[("file", ("a.png", _png(_exposure(_scene(), 1.0)), "image/png"))])
    assert r.status_code == 422


def test_photomerge_needs_two_photos(client):
    r = client.post("/api/merge/panorama", files=[("file", ("a.png", _png(_exposure(_scene(), 1.0)), "image/png"))])
    assert r.status_code == 422


def test_auto_align_needs_two_layers_and_answers_for_two(client):
    shot = _png(_exposure(_scene(), 1.0))
    assert client.post("/api/merge/align", files=[("file", ("a.png", shot, "image/png"))]).status_code == 422
    r = client.post("/api/merge/align", files=[("file", ("a.png", shot, "image/png")), ("file", ("b.png", shot, "image/png"))])
    assert r.status_code == 200 and isinstance(r.json(), dict)


def test_auto_blend_of_two_layers_answers(client):
    a = _png(np.concatenate([np.full((72, 96, 3), 200), np.full((72, 96, 1), 255)], axis=-1))
    b = _png(np.concatenate([np.full((72, 96, 3), 40), np.full((72, 96, 1), 255)], axis=-1))
    assert client.post("/api/merge/blend", files=[("file", ("a.png", a, "image/png"))]).status_code == 422
    r = client.post("/api/merge/blend", data={"method": "stack"}, files=[("file", ("a.png", a, "image/png")), ("file", ("b.png", b, "image/png"))])
    assert r.status_code == 200 and isinstance(r.json(), dict)


def test_spell_check_flags_the_misspelling_only(client):
    r = client.post("/api/spell/check", json={"words": ["hello", "helo", "qzxwv"], "lang": "en"}).json()
    assert [u["word"] for u in r["unknown"]] == ["helo", "qzxwv"]
    assert "hello" in next(u for u in r["unknown"] if u["word"] == "helo")["suggestions"]


def test_spell_check_refuses_a_word_that_is_too_long(client):
    assert client.post("/api/spell/check", json={"words": ["a" * 200], "lang": "en"}).status_code == 400


def test_capabilities_name_the_engine_and_its_limits(client):
    c = client.get("/api/capabilities").json()
    assert c["name"] and c["version"] == client.get("/api/version").json()["version"]
    assert c["pixelBudget"] > 0 and c["runtime"]["python"] and c["decode"]["tiff"] is True


def test_metrics_report_process_memory(client):
    m = client.get("/api/metrics").json()
    assert isinstance(m, dict) and m


def test_user_font_route_serves_only_font_files_inside_the_folder(client):
    assert client.get("/api/fonts/user").json()["fonts"] == []
    assert client.get("/api/fonts/user/../../etc/passwd").status_code == 404
    assert client.get("/api/fonts/user/nothing.ttf").status_code == 404
    assert client.get("/api/fonts/user/readme.txt").status_code == 404
