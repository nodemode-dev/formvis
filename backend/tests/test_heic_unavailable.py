"""HEIC where the engine has no decoder (a build made with FORMVIS_HEIF=0, or pillow-heif failed to load, and no sips):
the refusal says why and what to do, instead of the decoder's own words."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import imaging

HEIC = b"\x00\x00\x00\x18ftypheic" + bytes(64)


@pytest.fixture()
def no_decoder(monkeypatch):
    monkeypatch.setattr(imaging, "HEIF", False)
    monkeypatch.setattr(imaging, "sips_available", lambda: False)


def test_heic_without_a_decoder_names_the_reason_and_the_way_round(no_decoder):
    with pytest.raises(imaging.DecodeError) as caught:
        imaging.decode_to_png(HEIC, "photo.heic")
    said = str(caught.value)
    assert "photo.heic" in said and "no HEIC decoder" in said and "JPEG or TIFF" in said
    assert chr(0x2014) not in said


def test_the_decode_route_passes_the_reason_on(no_decoder):
    r = TestClient(app, base_url="http://127.0.0.1:8190").post("/api/io/decode", files={"file": ("photo.heic", HEIC, "image/heic")})
    assert r.status_code == 415
    assert "no HEIC decoder" in r.json()["detail"] and "JPEG or TIFF" in r.json()["detail"]


def test_a_damaged_heic_where_a_decoder_exists_keeps_the_decoders_words(monkeypatch):
    monkeypatch.setattr(imaging, "HEIF", True)
    monkeypatch.setattr(imaging, "sips_available", lambda: False)
    with pytest.raises(imaging.DecodeError) as caught:
        imaging.decode_to_png(HEIC, "photo.heic")
    assert str(caught.value).startswith("Could not decode photo.heic")
