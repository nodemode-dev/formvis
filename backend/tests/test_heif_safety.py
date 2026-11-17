"""A HEIF is checked against the engine's size limits before any pixel is decoded, and the deep decode runs in a child
process, so a crafted file cannot exhaust the engine's memory; the deep route says which of its two refusals applies."""

import queue
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import contained, imaging

FIX = Path(__file__).resolve().parent / "fixtures"
need_heif = pytest.mark.skipif(not imaging.HEIF, reason="needs pillow-heif")


@need_heif
def test_a_picture_declared_past_the_limits_is_refused_before_decoding(monkeypatch):
    monkeypatch.setattr(imaging.config, "MAX_SIDE", 8)
    decoded = []
    real = np.asarray
    monkeypatch.setattr(imaging.np, "asarray", lambda *a, **k: decoded.append(1) or real(*a, **k))
    with pytest.raises(imaging.DecodeError, match="limit"):
        imaging.heif_deep((FIX / "heic_10bit.heic").read_bytes())
    assert decoded == []


@need_heif
def test_the_child_reports_the_refusal_instead_of_decoding(monkeypatch):
    monkeypatch.setattr(imaging.config, "MAX_PIXELS", 10)
    q: queue.Queue = queue.Queue()
    contained._heif_worker(((FIX / "heic_10bit.heic").read_bytes(), 0, 1 << 40), q)
    status, message = q.get_nowait()
    assert status == "error" and "limit" in message


@need_heif
def test_the_deep_decode_runs_in_a_child_and_still_reads_10_bits():
    status, (px, bits) = contained.heif_deep((FIX / "heic_10bit.heic").read_bytes())
    assert status == "ok" and bits == 10 and px.dtype == np.uint16 and px.shape[2] == 4


@need_heif
def test_a_page_past_the_last_is_named():
    with pytest.raises(imaging.DecodeError, match="no picture 3"):
        imaging.heif_deep((FIX / "heic_two_images.heic").read_bytes(), 2)


def test_the_child_is_capped_at_more_than_the_largest_picture_needs():
    assert contained.heif_memory_limit() > imaging.config.MAX_PIXELS * 16


def client():
    return TestClient(app, base_url="http://127.0.0.1:8190")


def test_no_decoder_and_an_8_bit_file_are_two_different_refusals(monkeypatch):
    monkeypatch.setattr(imaging, "HEIF", False)
    r = client().post("/api/io/decode-deep", files={"file": ("shot.HIF", (FIX / "heic_10bit.heic").read_bytes(), "image/heic")})
    assert r.status_code == 415 and r.json()["detail"] == imaging.HEIF_NO_DECODER
    assert "no HEIF decoder" in r.json()["detail"] and "is 8-bit" not in r.json()["detail"]


@need_heif
def test_an_8_bit_heif_says_it_is_8_bit():
    r = client().post("/api/io/decode-deep", files={"file": ("p.heic", (FIX / "heic_8bit.heic").read_bytes(), "image/heic")})
    assert r.status_code == 415 and r.json()["detail"] == imaging.HEIF_EIGHT_BIT
