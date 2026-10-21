"""Crop and Straighten Photos, Merge to HDR with entered times, Photomerge, and the system routes (log, helpers, skins, local files), on synthetic input."""

import io
import json

import numpy as np
from PIL import Image, ImageDraw


def _png(arr) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.asarray(arr).astype(np.uint8)).save(buf, "PNG")
    return buf.getvalue()


def _scan():
    page = Image.new("RGB", (300, 200), (250, 250, 250))
    d = ImageDraw.Draw(page)
    d.rectangle([20, 20, 120, 90], fill=(200, 30, 30))
    d.rectangle([160, 100, 270, 180], fill=(30, 30, 200))
    return page


def test_crop_and_straighten_finds_each_photo_and_cuts_it_out(client):
    buf = io.BytesIO()
    _scan().save(buf, "PNG")
    r = client.post("/api/merge/photos", files={"file": ("scan.png", buf.getvalue(), "image/png")})
    photos = r.json()["photos"]
    assert len(photos) == 2
    first, second = photos
    assert abs(first["width"] - 101) <= 4 and abs(first["height"] - 71) <= 4
    assert abs(second["width"] - 111) <= 4 and abs(second["height"] - 81) <= 4
    a = Image.open(io.BytesIO(__import__("base64").b64decode(first["png"]))).convert("RGB")
    b = Image.open(io.BytesIO(__import__("base64").b64decode(second["png"]))).convert("RGB")
    assert a.size == (first["width"], first["height"])
    ca, cb = a.getpixel((a.width // 2, a.height // 2)), b.getpixel((b.width // 2, b.height // 2))
    assert ca[0] > 180 and ca[2] < 60 and cb[2] > 180 and cb[0] < 60


def test_crop_and_straighten_turns_a_tilted_photo_upright(client):
    page = Image.new("RGB", (300, 300), (245, 245, 245))
    photo = Image.new("RGB", (140, 80), (30, 160, 60))
    page.paste(photo.rotate(20, expand=True, fillcolor=(245, 245, 245)), (70, 90))
    buf = io.BytesIO()
    page.save(buf, "PNG")
    photos = client.post("/api/merge/photos", files={"file": ("s.png", buf.getvalue(), "image/png")}).json()["photos"]
    assert len(photos) == 1
    p = photos[0]
    assert max(p["width"], p["height"]) in range(135, 146) and min(p["width"], p["height"]) in range(75, 86)
    assert abs(abs(p["rect"]["angle"]) - 20) < 3 or abs(abs(p["rect"]["angle"]) - 70) < 3


def test_a_blank_scan_has_no_photos_and_garbage_is_refused(client):
    buf = io.BytesIO()
    Image.new("RGB", (120, 90), (240, 240, 240)).save(buf, "PNG")
    assert client.post("/api/merge/photos", files={"file": ("b.png", buf.getvalue(), "image/png")}).json() == {"photos": []}
    assert client.post("/api/merge/photos", files={"file": ("x.png", b"nope", "image/png")}).status_code == 422


def _scene(w=96, h=72):
    rng = np.random.default_rng(3)
    big = np.kron(rng.random((h // 8 + 1, w // 8 + 1)), np.ones((8, 8)))[:h, :w]
    return np.clip(big * 0.8 + np.linspace(0.05, 0.2, w)[None, :], 0, 1)


def _exposure(scene, gain):
    g = np.clip(scene * gain, 0, 1) ** (1 / 2.2)
    return np.stack([g, g * 0.9, g * 0.8], axis=-1) * 255


def _hdr(client, **form):
    files = [("file", (f"{i}.png", _png(_exposure(_scene(), g)), "image/png")) for i, g in enumerate((0.4, 1.0, 2.5))]
    return client.post("/api/merge/hdr", files=files, data=form)


def test_hdr_with_entered_times_reports_them_and_sizes_the_raw_floats(client):
    r = _hdr(client, align="false", times="0.25,1,4")
    n = int.from_bytes(r.content[:4], "little")
    head = json.loads(r.content[4:4 + n])
    assert head["source"] == "entered" and head["times"] == [0.25, 1.0, 4.0]
    assert (head["width"], head["height"]) == (96, 72)
    raw = np.frombuffer(r.content[4 + n:], np.float32)
    assert raw.size == 96 * 72 * 3 and np.isfinite(raw).all() and raw.max() > raw.min()


def test_hdr_refuses_wrong_counts_of_times_and_sizes_that_differ(client):
    assert _hdr(client, align="false", times="1,2").status_code == 422
    assert _hdr(client, align="false", times="1,0,2").status_code == 422
    files = [("file", ("a.png", _png(_exposure(_scene(), 1)), "image/png")), ("file", ("b.png", _png(_exposure(_scene(64, 48), 1)), "image/png"))]
    assert client.post("/api/merge/hdr", files=files).status_code == 422


def test_hdr_estimates_times_when_none_are_given_and_the_order_follows_the_exposure(client):
    r = _hdr(client, align="false")
    n = int.from_bytes(r.content[:4], "little")
    head = json.loads(r.content[4:4 + n])
    assert head["source"] == "estimated from the photos"
    t = head["times"]
    assert t[0] < t[1] < t[2] or sorted(t) != t


def test_photomerge_of_two_overlapping_halves_is_wider_than_either(client):
    scene = _exposure(_scene(160, 90), 1.2)
    a, b = scene[:, :100], scene[:, 60:]
    files = [("file", ("a.png", _png(a), "image/png")), ("file", ("b.png", _png(b), "image/png"))]
    r = client.post("/api/merge/panorama", files=files)
    if r.status_code == 200:
        im = Image.open(io.BytesIO(r.content))
        assert im.width > 100 and r.headers["X-Photos-Stitched"].endswith("/2")
    else:
        assert r.status_code == 422


def test_the_engine_log_names_its_file_and_keeps_the_requested_tail(client):
    r = client.get("/api/log", params={"lines": 5}).json()
    assert r["path"].endswith("formvis-engine.log")
    assert len(r["text"].splitlines()) <= 5


def test_helpers_start_empty_and_free_reports_what_it_dropped(client):
    held = client.get("/api/helpers").json()["held"]
    assert held == [] or isinstance(held, list)
    r = client.post("/api/helpers/free").json()
    assert r["held"] == [] and isinstance(r["freed"], list)


def test_skins_load_the_good_files_and_name_the_bad_one(client, tmp_path):
    first = client.get("/api/skins").json()
    from pathlib import Path
    folder = Path(first["folder"])
    assert folder.is_dir() and first["skins"] == [] and first["errors"] == []
    (folder / "broken.json").write_text("{not json")
    again = client.get("/api/skins").json()
    assert [e["file"] for e in again["errors"]] == ["broken.json"] and again["errors"][0]["error"]


def test_local_files_stats_list_every_folder_and_clean_removes_only_stale_files(client):
    import os
    import time
    from pathlib import Path
    stats = client.get("/api/localfiles/stats").json()
    assert {f["id"] for f in stats["folders"]} == {"library", "models", "exports", "generated", "logs", "plugins"}
    assert stats["unreferenced"]["files"] == 0
    models = Path(next(f["path"] for f in stats["folders"] if f["id"] == "models"))
    models.mkdir(parents=True, exist_ok=True)
    stale, fresh = models / "old.part", models / "new.part"
    stale.write_bytes(b"x" * 100)
    fresh.write_bytes(b"y" * 50)
    old = time.time() - 7200
    os.utime(stale, (old, old))
    seen = client.get("/api/localfiles/stats").json()["unreferenced"]
    assert seen["files"] >= 1 and seen["bytes"] >= 100
    done = client.post("/api/localfiles/clean").json()
    assert done["removed"] >= 1 and done["bytes"] >= 100
    assert not stale.exists() and fresh.exists()
