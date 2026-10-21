import json
import os
import time
from pathlib import Path

from tests.conftest import manifest, png_bytes

HEADER = {"x-formvis": "1"}


def test_a_path_save_writes_beside_the_target_flushes_file_and_folder_and_leaves_no_temp_file(client, tmp_path, monkeypatch):
    synced = []
    real = os.fsync
    monkeypatch.setattr(os, "fsync", lambda fd: (synced.append(fd), real(fd))[1])
    target = tmp_path / "out" / "pic.fvd"
    target.parent.mkdir()
    r = client.post("/api/projects/save-to", data={"path": str(target), "manifest": json.dumps(manifest())}, headers=HEADER)
    assert r.status_code == 200 and r.json()["size"] == target.stat().st_size
    assert len(synced) >= 2
    assert [p.name for p in target.parent.iterdir()] == ["pic.fvd"]


def test_a_failed_path_save_keeps_the_old_file_whole_and_removes_its_temp_file(client, tmp_path, monkeypatch):
    target = tmp_path / "keep.fvd"
    ok = client.post("/api/projects/save-to", data={"path": str(target), "manifest": json.dumps(manifest())}, headers=HEADER)
    assert ok.status_code == 200
    before = target.read_bytes()

    def boom(*a, **k):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(os, "replace", boom)
    bad = client.post("/api/projects/save-to", data={"path": str(target), "manifest": json.dumps(manifest(width=9))}, headers=HEADER)
    assert bad.status_code == 400
    assert target.read_bytes() == before
    assert [p.name for p in tmp_path.iterdir() if p.suffix == ".tmp"] == []


def test_linked_file_reads_inside_the_document_folder_and_refuses_escapes_shares_and_non_images(client, tmp_path):
    doc = tmp_path / "doc"
    doc.mkdir()
    (doc / "a.png").write_bytes(png_bytes())
    (tmp_path / "secret.png").write_bytes(png_bytes())
    (doc / "notes.txt").write_text("x")
    ok = client.get("/api/file", params={"path": "a.png", "base": str(doc)})
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/png" and "last-modified" in ok.headers
    assert client.get("/api/file", params={"path": str(doc / "a.png")}).status_code == 200
    assert client.get("/api/file", params={"path": "../secret.png", "base": str(doc)}).status_code == 400
    assert client.get("/api/file", params={"path": "a.png"}).status_code == 400
    assert client.get("/api/file", params={"path": "a.png", "base": "relative/dir"}).status_code == 400
    assert client.get("/api/file", params={"path": "//server/share/a.png"}).status_code == 400
    assert client.get("/api/file", params={"path": str(doc / "notes.txt")}).status_code == 400
    assert client.get("/api/file", params={"path": "missing.png", "base": str(doc)}).status_code == 404
    (doc / "link.png").symlink_to(doc / "notes.txt")
    assert client.get("/api/file", params={"path": "link.png", "base": str(doc)}).status_code == 400


def test_local_files_stats_count_a_stale_picture_and_clean_removes_it_but_keeps_a_fresh_one(client):
    from app.localgen import media

    media.LIBRARY.mkdir(parents=True, exist_ok=True)
    stale, fresh = media.LIBRARY / "stale.png", media.LIBRARY / "fresh.png"
    stale.write_bytes(b"s" * 300)
    fresh.write_bytes(b"f" * 40)
    old = time.time() - 3 * 86400
    os.utime(stale, (old, old))
    seen = client.get("/api/localfiles/stats").json()
    assert seen["unreferenced"]["files"] == 1 and seen["unreferenced"]["bytes"] == 300
    gen = next(f for f in seen["folders"] if f["id"] == "generated")
    assert Path(gen["path"]).name == "generated"
    done = client.post("/api/localfiles/clean").json()
    assert done["removed"] == 1 and done["bytes"] == 300
    assert not stale.exists() and fresh.exists()
    assert client.get("/api/localfiles/stats").json()["unreferenced"]["files"] == 0
