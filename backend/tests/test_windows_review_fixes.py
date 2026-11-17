"""The Windows run of 2.3.5: a Canon .HIF opens by path like .heic and .heif, file_info reports a 16-bit file's real depth,
and convert_file asking to replace a file fails at once when no window is open to approve it."""

import asyncio
import os
import time

import numpy as np
import pytest

os.environ["FORMVIS_OPEN_WINDOW"] = "0"

from app.routers import io as io_router  # noqa: E402
from app.routers import mcp as M  # noqa: E402
from app.routers import system  # noqa: E402
from app.services import agents, imaging  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.mark.parametrize("name", ["IMG_0001.HIF", "shot.hif", "a.HEIF", "b.Heic"])
def test_every_heif_spelling_opens_by_path(tmp_path, name):
    f = tmp_path / name
    f.write_bytes(b"\0")
    assert M._path(str(f), M._FILES["open_file"][0], True) == f.resolve()
    assert name.lower().endswith(io_router.DISK_KINDS)
    assert os.path.splitext(name)[1].lower() in system._LINK_IMAGE_SUFFIXES
    assert os.path.splitext(name)[1].lower() in imaging.HEIF_SUFFIXES


def test_open_file_names_hif_among_what_it_opens():
    tool = next(t for t in M.TOOLS if t["name"] == "open_file")
    assert "HIF" in tool["description"]


@pytest.mark.parametrize("suffix", [".tif", ".png"])
def test_file_info_reports_a_16_bit_picture_as_16_bit(tmp_path, suffix):
    import cv2

    f = tmp_path / f"deep{suffix}"
    px = np.zeros((6, 8, 3), np.uint16)
    px[:, :, 1] = 40000
    assert cv2.imwrite(str(f), px)
    info = M._info({"path": str(f)})
    assert info["depth"] == 16 and info["width"] == 8 and info["height"] == 6


def test_file_info_keeps_8_bit_pictures_at_8(tmp_path):
    from PIL import Image

    f = tmp_path / "flat.tif"
    Image.new("RGB", (4, 3)).save(f)
    assert M._info({"path": str(f)})["depth"] == 8


@pytest.mark.skipif(not imaging.HEIF, reason="needs pillow-heif")
def test_file_info_reads_a_10_bit_heif_as_10_bit(tmp_path):
    f = tmp_path / "shot.HIF"
    f.write_bytes(open(os.path.join(FIX, "heic_10bit.heic"), "rb").read())
    assert M._info({"path": str(f)})["depth"] == 10


def test_replacing_a_file_with_no_window_fails_at_once(tmp_path, monkeypatch):
    from PIL import Image

    src, dst = tmp_path / "in.png", tmp_path / "out.jpg"
    Image.new("RGB", (4, 3), (200, 10, 10)).save(src)
    dst.write_bytes(b"old")
    monkeypatch.setattr(M, "_live", lambda: False)
    monkeypatch.setattr(agents, "policy_of", lambda client: "ask")
    started = time.monotonic()
    out = asyncio.run(M._agent_call("test-agent", "convert_file", {"path": str(src), "output_path": str(dst), "overwrite": True}))
    assert time.monotonic() - started < 5
    assert out["isError"] and "no formvis window is open" in out["content"][0]["text"]
    assert dst.read_bytes() == b"old"


def test_a_new_file_converts_with_no_window(tmp_path, monkeypatch):
    from PIL import Image

    src, dst = tmp_path / "in.png", tmp_path / "out.jpg"
    Image.new("RGB", (4, 3), (200, 10, 10)).save(src)
    monkeypatch.setattr(M, "_live", lambda: False)
    monkeypatch.setattr(agents, "policy_of", lambda client: "ask")
    out = asyncio.run(M._agent_call("test-agent", "convert_file", {"path": str(src), "output_path": str(dst)}))
    assert not out.get("isError"), out
    assert dst.read_bytes()[:2] == b"\xff\xd8"


def test_convert_file_says_when_it_needs_the_window():
    tool = next(t for t in M.TOOLS if t["name"] == "convert_file")
    assert "fails at once when no window is open" in tool["description"]
