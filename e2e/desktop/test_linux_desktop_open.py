"""Files named in the shell's launch arguments reach the page: main.rs queues them until the page calls take_pending_opens."""
import json
import struct
import zlib
from pathlib import Path


def write_png(path: Path, width: int, height: int, rgb: tuple[int, int, int]) -> Path:
    row = b"\x00" + bytes(rgb) * width

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    raw = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * height)) + chunk(b"IEND", b"")
    path.write_bytes(raw)
    return path


def documents(app) -> list[dict]:
    if not app.alive():
        return []
    out = app.call("get_document")
    return [] if out.get("isError") else json.loads(app.text_of(out)).get("documents", [])


def test_a_png_in_the_launch_arguments_opens_in_the_window(fresh, shots):
    picture = write_png(fresh.workdir / "launch-picture.png", 96, 64, (30, 140, 220))
    fresh.launch(str(picture))
    found = fresh.wait_for(lambda: documents(fresh), timeout=60, what="the launched picture to open")
    assert len(found) == 1
    assert (found[0]["width"], found[0]["height"]) == (96, 64)
    assert "launch-picture" in found[0]["name"]
    fresh.screenshot("opened")


def test_launch_arguments_that_are_not_files_are_ignored(fresh):
    fresh.launch("--no-such-flag", str(fresh.workdir / "missing.png"))
    fresh.ok("ping")
    fresh.wait_for(lambda: fresh.state()["polls"] >= 2, timeout=40, what="the bridge poll")
    assert documents(fresh) == []


def test_two_pictures_in_the_arguments_both_open(fresh):
    one = write_png(fresh.workdir / "first.png", 40, 30, (200, 30, 30))
    two = write_png(fresh.workdir / "second.png", 50, 20, (30, 200, 30))
    fresh.launch(str(one), str(two))
    found = fresh.wait_for(lambda: len(documents(fresh)) >= 2 and documents(fresh), timeout=60, what="both pictures to open")
    assert sorted((d["width"], d["height"]) for d in found) == [(40, 30), (50, 20)]
