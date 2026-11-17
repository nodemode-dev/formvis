"""HEIC and HEIF read through libheif at their own depth, and the desktop build that carries no GPL code.

The pictures in tests/fixtures are lossless synthetic ramps written by make_heif_fixtures.py, so pixel values are exact."""
import importlib.util
import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.services import imaging

ROOT = Path(__file__).resolve().parents[2]
FIX = Path(__file__).resolve().parent / "fixtures"


def heif_decode():
    spec = importlib.util.spec_from_file_location("heif_decode", ROOT / "setup" / "heif_decode.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ramp(x: int, y: int, top: int, width: int = 16, height: int = 12) -> tuple[int, int, int]:
    return x * top // (width - 1), y * top // (height - 1), top // 2


def test_libheif_is_the_decoder_and_keeps_16_bits():
    d = imaging.decoders()
    assert d["heic"] is True and d["engine"] == "pillow-heif"
    assert d["heicEngine"].startswith("libheif ") and d["heicBits"] == 16


def test_an_8_bit_heic_decodes_to_its_exact_pixels(client):
    r = client.post("/api/io/decode", files={"file": ("ramp.heic", (FIX / "heic_8bit.heic").read_bytes(), "image/heic")})
    assert r.status_code == 200, r.text
    image = Image.open(io.BytesIO(r.content))
    assert image.size == (16, 12) and image.mode == "RGB"
    for x, y in ((0, 0), (7, 5), (15, 11), (3, 9)):
        assert image.getpixel((x, y)) == ramp(x, y, 255)


def test_a_10_bit_heic_keeps_its_depth():
    px, bits = imaging.heif_deep((FIX / "heic_10bit.heic").read_bytes())
    assert bits == 10 and px.dtype == np.uint16 and px.shape == (12, 16, 4)
    top = 1023 << 6
    for x, y in ((0, 0), (7, 5), (15, 11)):
        want = [v * 64 * 65535 // top for v in ramp(x, y, 1023)] + [65535]
        assert px[y, x].tolist() == want
    assert len(np.unique(px[0, :, 0])) == 16


def test_the_deep_route_answers_16_bit_samples_with_the_file_depth(client):
    r = client.post("/api/io/decode-deep", files={"file": ("ramp.heic", (FIX / "heic_10bit.heic").read_bytes(), "image/heic")})
    assert r.status_code == 200, r.text
    assert (r.headers["X-Width"], r.headers["X-Height"], r.headers["X-Depth"], r.headers["X-Bits"]) == ("16", "12", "16", "10")
    px = np.frombuffer(r.content, "<u2").reshape(12, 16, 4)
    assert px[11, 15, 0] == 65535 and px[0, 0, 0] == 0


def test_an_8_bit_heic_is_not_offered_as_deep(client):
    r = client.post("/api/io/decode-deep", files={"file": ("ramp.heic", (FIX / "heic_8bit.heic").read_bytes(), "image/heic")})
    assert r.status_code == 415


def test_every_image_of_a_heif_is_listed_and_each_decodes(client):
    data = (FIX / "heic_two_images.heic").read_bytes()
    pages = client.post("/api/io/pages", files={"file": ("pair.heic", data, "image/heic")}).json()["pages"]
    assert [(p["index"], p["width"], p["height"]) for p in pages] == [(0, 8, 6), (1, 4, 4)]
    first = client.post("/api/io/decode", files={"file": ("pair.heic", data, "image/heic")})
    second = client.post("/api/io/decode", files={"file": ("pair.heic", data, "image/heic")}, data={"page": "1"})
    assert Image.open(io.BytesIO(first.content)).getpixel((3, 3)) == (200, 40, 40)
    assert Image.open(io.BytesIO(second.content)).getpixel((2, 2)) == (30, 60, 220)
    assert client.post("/api/io/decode", files={"file": ("pair.heic", data, "image/heic")}, data={"page": "2"}).status_code == 415


def test_a_damaged_heic_is_refused_not_crashed(client):
    bad = b"\x00\x00\x00\x18ftypheic" + bytes(64)
    assert client.post("/api/io/decode", files={"file": ("bad.heic", bad, "image/heic")}).status_code == 415
    with pytest.raises(imaging.DecodeError):
        imaging.heif_deep(bad)


def test_the_packaging_check_finds_gpl_codec_libraries(tmp_path):
    hd = heif_decode()
    clean = tmp_path / "clean"
    (clean / "_internal" / "pillow_heif").mkdir(parents=True)
    (clean / "_internal" / "libheif.1.dylib").write_bytes(b"\0")
    (clean / "_internal" / "libde265-91206b2b.so.0.2.3").write_bytes(b"\0")
    (clean / "PKG-00.toc").write_text("[('libheif.1.dylib', '/v/lib/libheif.1.dylib', 'BINARY')]")
    assert hd.gpl_hits([clean]) == []
    for name in ("libx265.217.dylib", "libx265-4883ecb5.so.217", "libx265-217-276e7d75772a32bd086b54d54e01fd11.dll", "libx264.164.dylib"):
        bad = tmp_path / name.replace(".", "_")
        bad.mkdir()
        (bad / name).write_bytes(b"\0")
        assert hd.gpl_hits([bad]), name
    toc = tmp_path / "onefile"
    toc.mkdir()
    (toc / "PKG-00.toc").write_text("[('libx265-4883ecb5.so.217', '/v/pillow_heif.libs/libx265-4883ecb5.so.217', 'BINARY')]")
    assert hd.gpl_hits([toc])
    assert hd.main(["--check", str(clean)]) == 0 and hd.main(["--check", str(toc)]) == 1


def test_the_desktop_libheif_is_built_with_no_encoder_and_no_plugin_loading():
    hd = heif_decode()
    flags = set(hd.LIBHEIF_FLAGS)
    assert {"-DWITH_X265=OFF", "-DWITH_X264=OFF", "-DENABLE_PLUGIN_LOADING=OFF", "-DWITH_LIBDE265=ON"} <= flags
    assert not any(f.endswith("=ON") for f in flags - {"-DWITH_LIBDE265=ON"})
    assert "-DENABLE_ENCODER=OFF" in hd.LIBDE265_FLAGS
    for _version, url, sha in hd.SOURCES.values():
        assert url.startswith("https://github.com/strukturag/") and len(sha) == 64
    assert hd.is_wanted({"installed": True, "decode_only": True, "version": hd.PILLOW_HEIF, "libheif": hd.LIBHEIF, "decoders": ["libde265"]})
    assert not hd.is_wanted({"installed": True, "decode_only": False, "version": hd.PILLOW_HEIF, "libheif": hd.LIBHEIF, "decoders": ["libde265"]})


def test_the_freeze_scripts_build_heic_decoding_and_check_the_engine():
    for script in ("setup/freeze_backend", "setup/freeze_backend.bat"):
        text = (ROOT / script).read_text()
        assert "heif_decode.py" in text and "heif_decode.py\" --check dist-engine" in text, script
        assert "--hidden-import pillow_heif" in text, script
        assert text.count("--exclude-module pillow_heif") == 1 and "FORMVIS_HEIF" in text, script


def test_the_requirements_pin_the_pillow_heif_the_desktop_builds():
    pinned = [line.split("#")[0].strip() for line in (ROOT / "backend" / "requirements.txt").read_text().splitlines() if line.startswith("pillow-heif==")]
    assert pinned == [f"pillow-heif=={heif_decode().PILLOW_HEIF}"]


def test_a_frozen_engine_with_a_gpl_encoder_fails_its_selfcheck(monkeypatch, capsys):
    sys.path.insert(0, str(ROOT / "backend"))
    import formvis_engine
    import pillow_heif

    real = pillow_heif.libheif_info
    monkeypatch.setattr(pillow_heif, "libheif_info", lambda: {**real(), "encoders": {"x265": "x265 HEVC encoder", "mask": "mask"}})
    assert formvis_engine.heic_check()["gpl"] == ["x265"]
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert formvis_engine.selfcheck() == 1
    assert json.loads(capsys.readouterr().out.strip().splitlines()[-1])["heic"]["gpl"] == ["x265"]


@pytest.mark.parametrize("name", ["heic_8bit.heic", "heic_10bit.heic", "heic_two_images.heic"])
def test_the_fixtures_stay_tiny(name):
    assert (FIX / name).stat().st_size < 4096
