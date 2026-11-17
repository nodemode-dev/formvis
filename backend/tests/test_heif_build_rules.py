"""The rules that keep the desktop HEIC build decode-only and honest: the GPL name check, the allowlist, the Windows
platform flag, the universal macOS flags, the pinned pillow-heif sdist, and the frozen engine's --selfcheck."""

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
import formvis_engine  # noqa: E402


def heif_decode():
    spec = importlib.util.spec_from_file_location("heif_decode", ROOT / "setup" / "heif_decode.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("name", ["libx265_main10.dll", "libx265_main12.a", "libheif-x265.so", "libx265-mt.dll", "x264.lib", "libx265.so.215"])
def test_every_x265_or_x264_build_is_named(tmp_path, name):
    folder = tmp_path / "dist"
    folder.mkdir()
    (folder / name).write_bytes(b"\0")
    assert heif_decode().gpl_hits([folder]), name


@pytest.mark.parametrize("name", ["libheif-dav1d.so", "libheif-aomenc.dylib", "libheif-ffmpegdec.dll"])
def test_a_libheif_plugin_file_is_flagged(tmp_path, name):
    (tmp_path / name).write_bytes(b"\0")
    assert heif_decode().gpl_hits([tmp_path]), name


def test_the_decode_only_libraries_pass(tmp_path):
    for name in ("libheif.1.dylib", "heif.dll", "libheif.so.1", "libde265.dll", "libde265-0.dll"):
        (tmp_path / name).write_bytes(b"\0")
    assert heif_decode().gpl_hits([tmp_path]) == []


def test_the_build_must_hold_libde265_alone_and_no_encoder_but_mask():
    hd = heif_decode()
    good = {"installed": True, "decode_only": True, "version": hd.PILLOW_HEIF, "libheif": hd.LIBHEIF, "decoders": ["libde265"], "encoders": ["mask"]}
    assert hd.is_wanted(good)
    assert not hd.is_wanted({**good, "decoders": ["dav1d", "libde265"]})
    assert not hd.is_wanted({**good, "encoders": ["mask", "x265"]})


@pytest.mark.parametrize("tag,generator,want", [
    ("win-amd64", "", ["-A", "x64"]), ("win32", "", ["-A", "Win32"]), ("win-arm64", "Visual Studio 17 2022", ["-A", "ARM64"]),
    ("win-amd64", "Ninja", []), ("linux-x86_64", "", []),
])
def test_the_windows_platform_flag_follows_the_python_and_the_generator(tag, generator, want):
    assert heif_decode().generator_args({"CMAKE_GENERATOR": generator} if generator else {}, tag) == want


def test_a_universal_engine_builds_both_mac_architectures():
    hd = heif_decode()
    flags, env = hd.mac_arch_args({"FORMVIS_PYI_ARCH": "universal2"})
    assert flags == ["-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64"] and env == {"ARCHFLAGS": "-arch arm64 -arch x86_64"}
    assert hd.mac_arch_args({}) == ([], {})


def test_pillow_heif_and_its_build_tools_are_held_to_their_hashes(tmp_path):
    hd = heif_decode()
    args = hd.pillow_heif_install_args(tmp_path / "req.txt")
    assert "--require-hashes" in args and "--no-build-isolation" in args and "--no-binary" in args
    assert len(hd.PILLOW_HEIF_SDIST_SHA256) == 64 and all(len(sha) == 64 and "==" in pin for pin, sha in hd.BUILD_TOOLS)


GOOD = {"decoder": "libheif 1.23.7", "decoders": ["libde265"], "encoders": ["mask"], "gpl": []}


@pytest.mark.parametrize("heic,why", [
    ({"decoder": "none", "gpl": [], "error": "No module named pillow_heif"}, "no HEIC decoder"),
    ({**GOOD, "decoders": []}, "decoders"),
    ({**GOOD, "encoders": ["mask", "x265"], "gpl": ["x265"]}, "encoders"),
])
def test_a_build_that_must_carry_heic_fails_its_selfcheck_without_it(heic, why):
    assert why in formvis_engine.heic_problem(heic, True)
    assert formvis_engine.heic_problem(heic, False) == ""


def test_the_right_build_passes():
    assert formvis_engine.heic_problem(GOOD, True) == ""


def test_the_freeze_scripts_require_heic_when_they_built_it():
    sh = (ROOT / "setup" / "freeze_backend").read_text(encoding="utf-8")
    bat = (ROOT / "setup" / "freeze_backend.bat").read_text(encoding="utf-8")
    assert "export FORMVIS_REQUIRE_HEIC=1" in sh and "set FORMVIS_REQUIRE_HEIC=1" in bat
    assert '--selfcheck || cv_die' in sh and "--selfcheck || (" in bat
