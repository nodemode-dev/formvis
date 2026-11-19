#!/usr/bin/env python3
"""HEIC and HEIF decoding for the frozen desktop engine, with no GPL code.

pillow-heif's wheels from PyPI link libheif to the GPL x265 encoder, so they never ship. This script builds libde265
and libheif (both LGPL-3.0) from their release archives, checked against the SHA-256 sums below, with every encoder,
every other codec and plugin loading switched off, then builds pillow-heif (BSD-3-Clause) from its source archive
against them, in the engine's virtual environment (the libraries go to its `formvis-heif` folder, the downloads and
builds to backend/build/heif). Run it with that environment's Python:

    backend/venv/bin/python setup/heif_decode.py                  (Windows: backend\\venv\\Scripts\\python)

It does nothing when the installed pillow-heif is already this build. `--check PATH...` scans folders, files and
PyInstaller TOC files for a GPL codec library and exits 1 when it finds one; `--status` prints what is installed.
Needs cmake and a C and C++ compiler (Xcode's command line tools, build-essential, or Visual Studio on Windows).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import sysconfig
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "backend" / "build" / "heif"
PILLOW_HEIF = "1.8.1"
PILLOW_HEIF_SDIST_SHA256 = "521ebffb8a181d56c3904e5a61f20903edee0d9d3275967b8fb345f866215c06"   # PyPI's record for pillow_heif-1.8.1.tar.gz
BUILD_TOOLS = (("setuptools==80.9.0", "062d34222ad13e0cc312a4c02d73f059e86a4acbfbdea8f8f76b28c99f306922"),
               ("wheel==0.45.1", "708e7481cc80179af0e556bbf0cc00b8444c7321e2700b8d8580231d13017248"))


def pillow_heif_install_args(requirements: Path) -> list[str]:
    """pillow-heif built from its sdist, held to PyPI's SHA-256, with the pinned setuptools and wheel already installed
    (no build isolation, so pip fetches no unpinned build tool)."""
    return ["--force-reinstall", "--no-deps", "--no-cache-dir", "--require-hashes", "--no-build-isolation",
            "--no-binary", "pillow-heif", "-r", str(requirements)]
LIBHEIF = "1.23.7"
SOURCES = {
    "libde265": ("1.1.3", "https://github.com/strukturag/libde265/releases/download/v1.1.3/libde265-1.1.3.tar.gz",
                 "554228bd17788c99a7e63b37ab5634722190e6e2bf60c1dcb01cef328e133905"),
    "libheif": (LIBHEIF, f"https://github.com/strukturag/libheif/releases/download/v{LIBHEIF}/libheif-{LIBHEIF}.tar.gz",
                "f7483e818503ea6224c8863e4a56ac02c7089021a98472c811c12aa19faf2475"),
}
GPL_LIBRARY = re.compile(r"x26[45][^/\\'\" ]*\.(?:so|dylib|dll|a|lib)\b", re.I)
HEIF_PLUGIN = re.compile(r"libheif-[^/\\'\" ]*\.(?:so|dylib|dll)\b", re.I)
DECODE_ONLY_ENCODERS = {"mask"}
DECODE_ONLY_DECODERS = ["libde265"]
LIBDE265_FLAGS = ["-DENABLE_SDL=OFF", "-DENABLE_DECODER=OFF", "-DENABLE_ENCODER=OFF", "-DENABLE_SHERLOCK265=OFF"]
LIBHEIF_OFF = ["X265", "KVAZAAR", "UVG266", "VVDEC", "VVENC", "X264", "OpenH264_DECODER", "DAV1D", "AOM_DECODER",
               "AOM_ENCODER", "SvtEnc", "RAV1E", "JPEG_DECODER", "JPEG_ENCODER", "OpenJPEG_ENCODER", "OpenJPEG_DECODER",
               "FFMPEG_DECODER", "OPENJPH_ENCODER"]
LIBHEIF_FLAGS = ([f"-DWITH_{name}=OFF" for name in LIBHEIF_OFF] + [f"-DWITH_{name}_PLUGIN=OFF" for name in LIBHEIF_OFF]
                 + ["-DWITH_LIBDE265=ON", "-DWITH_LIBDE265_PLUGIN=OFF", "-DENABLE_PLUGIN_LOADING=OFF",
                    "-DWITH_UNCOMPRESSED_CODEC=OFF", "-DWITH_HEADER_COMPRESSION=OFF", "-DWITH_LIBSHARPYUV=OFF",
                    "-DWITH_EXAMPLES=OFF", "-DWITH_GDK_PIXBUF=OFF", "-DBUILD_TESTING=OFF", "-DBUILD_DOCUMENTATION=OFF",
                    "-DWITH_FUZZERS=OFF", "-DWITH_WEBCODECS=OFF"])


class HeifBuildError(Exception):
    pass


def say(text: str) -> None:
    print(f"[formvis] {text}", flush=True)


def gpl_hits(paths: list[Path]) -> list[str]:
    """Every GPL codec library (x265, x264, in any build: main10, main12, -mt, a libheif-x265 plugin) and every libheif
    plugin file found under the folders, as a file name, or named inside a TOC or text file."""
    hits = []
    for path in paths:
        files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()] if path.is_dir() else []
        for f in files:
            if GPL_LIBRARY.search(f.name) or HEIF_PLUGIN.search(f.name):
                hits.append(str(f))
            elif f.suffix.lower() in (".toc", ".txt", ".json") and f.stat().st_size < 64 << 20:
                text = f.read_text(encoding="utf-8", errors="replace")
                found = GPL_LIBRARY.search(text) or HEIF_PLUGIN.search(text)
                if found:
                    hits.append(f"{f}: {found.group(0).strip()}")
    return hits


def status() -> dict:
    """What the running Python has: pillow-heif's version, its libheif, its encoders and decoders."""
    try:
        import pillow_heif
    except Exception as exc:
        return {"installed": False, "error": str(exc)}
    info = pillow_heif.libheif_info()
    encoders = sorted((info.get("encoders") or {}).keys())
    return {"installed": True, "version": pillow_heif.__version__, "libheif": info.get("libheif"), "encoders": encoders,
            "decoders": sorted((info.get("decoders") or {}).keys()), "decode_only": set(encoders) <= DECODE_ONLY_ENCODERS,
            "package": str(Path(pillow_heif.__file__).parent)}


def _site() -> Path:
    return Path(sysconfig.get_paths()["platlib"])


def is_wanted(s: dict) -> bool:
    """The build this script makes: this pillow-heif and libheif, libde265 the only decoder, no encoder beyond mask (the
    same allowlist the frozen engine's --selfcheck enforces with FORMVIS_REQUIRE_HEIC=1)."""
    return bool(s.get("installed") and s.get("decode_only") and set(s.get("encoders", [])) <= DECODE_ONLY_ENCODERS
                and s.get("version") == PILLOW_HEIF and s.get("libheif") == LIBHEIF and s.get("decoders") == DECODE_ONLY_DECODERS)


def windows_arch(platform_tag: str) -> str | None:
    """Visual Studio's -A for the Python being built against: win32, win-amd64 and win-arm64."""
    return {"win32": "Win32", "win-amd64": "x64", "win-arm64": "ARM64"}.get(platform_tag)


def generator_args(env: dict, platform_tag: str) -> list[str]:
    """-A only for a Visual Studio generator (the default on Windows); Ninja and makefiles take no platform."""
    generator = env.get("CMAKE_GENERATOR", "")
    arch = windows_arch(platform_tag)
    return ["-A", arch] if arch and (not generator or generator.startswith("Visual Studio")) else []


def mac_arch_args(env: dict) -> tuple[list[str], dict]:
    """With FORMVIS_PYI_ARCH=universal2 (a universal engine), both architectures in every library and in pillow-heif."""
    if env.get("FORMVIS_PYI_ARCH") != "universal2":
        return [], {}
    return ["-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64"], {"ARCHFLAGS": "-arch arm64 -arch x86_64"}


def _fetch(name: str) -> Path:
    version, url, sha = SOURCES[name]
    archive = WORK / "dl" / f"{name}-{version}.tar.gz"
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != sha:
        say(f"downloading {url}")
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != sha:
            raise HeifBuildError(f"{url} does not match its SHA-256 {sha}")
        archive.write_bytes(data)
    src = WORK / "src" / f"{name}-{version}"
    if src.exists():
        shutil.rmtree(src)
    src.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as tar:
        tar.extractall(src.parent, filter="data")
    if not (src / "CMakeLists.txt").exists():
        raise HeifBuildError(f"{archive} did not hold {src.name}/CMakeLists.txt")
    return src


def _cmake(src: Path, prefix: Path, flags: list[str]) -> None:
    build = WORK / "cmake" / src.name
    if build.exists():
        shutil.rmtree(build)
    common = [f"-DCMAKE_INSTALL_PREFIX={prefix}", f"-DCMAKE_PREFIX_PATH={prefix}", "-DCMAKE_BUILD_TYPE=Release",
              "-DBUILD_SHARED_LIBS=ON", "-DCMAKE_INSTALL_LIBDIR=lib", "-DCMAKE_POLICY_VERSION_MINIMUM=3.5"]
    env = {**os.environ, "PKG_CONFIG_PATH": str(prefix / "lib" / "pkgconfig"), "PKG_CONFIG_LIBDIR": str(prefix / "lib" / "pkgconfig")}
    if platform.system() == "Darwin":
        common += [f"-DCMAKE_INSTALL_NAME_DIR={prefix / 'lib'}",
                   f"-DCMAKE_OSX_DEPLOYMENT_TARGET={os.environ.get('MACOSX_DEPLOYMENT_TARGET', '14.0')}"]
        arch_flags, arch_env = mac_arch_args(os.environ)
        common += arch_flags
        env.update(arch_env)
    elif platform.system() == "Linux":
        common += [f"-DCMAKE_INSTALL_RPATH={prefix / 'lib'}"]
    elif platform.system() == "Windows":
        common += generator_args(os.environ, sysconfig.get_platform())
    for step in (["cmake", "-S", str(src), "-B", str(build), *common, *flags],
                 ["cmake", "--build", str(build), "--config", "Release", "--parallel", _jobs()],
                 ["cmake", "--install", str(build), "--config", "Release"]):
        subprocess.run(step, check=True, env=env)


def _jobs() -> str:
    """CMAKE_BUILD_PARALLEL_LEVEL when set, else at most four: libheif's C++ needs about 1 GB a job."""
    return os.environ.get("CMAKE_BUILD_PARALLEL_LEVEL") or str(min(os.cpu_count() or 1, 4))


def _windows_import_library(prefix: Path) -> None:
    lib = prefix / "lib"
    if not (lib / "libheif.lib").exists():
        made = next((p for p in (lib / "heif.lib", lib / "libheif.dll.a") if p.exists()), None)
        if made is None:
            raise HeifBuildError(f"no import library for libheif in {lib}")
        shutil.copyfile(made, lib / "libheif.lib")


def _pip_pillow_heif(prefix: Path) -> None:
    env = {**os.environ, "LIBHEIF_ROOT": str(prefix), "PKG_CONFIG_PATH": str(prefix / "lib" / "pkgconfig")}
    if platform.system() == "Windows":
        env["MSYS2_PREFIX"] = str(prefix)
    elif platform.system() == "Linux":
        env["LDFLAGS"] = f"-Wl,-rpath,{prefix / 'lib'} {os.environ.get('LDFLAGS', '')}".strip()
    else:
        env["MACOSX_DEPLOYMENT_TARGET"] = os.environ.get("MACOSX_DEPLOYMENT_TARGET", "14.0")
    if platform.system() == "Darwin":
        env.update(mac_arch_args(os.environ)[1])
    WORK.mkdir(parents=True, exist_ok=True)
    tools, sdist = WORK / "build-tools.txt", WORK / "pillow-heif.txt"
    tools.write_text("".join(f"{pin} --hash=sha256:{sha}\n" for pin, sha in BUILD_TOOLS), encoding="utf-8")
    sdist.write_text(f"pillow-heif=={PILLOW_HEIF} --hash=sha256:{PILLOW_HEIF_SDIST_SHA256}\n", encoding="utf-8")
    subprocess.run([sys.executable, "-m", "pip", "install", "--require-hashes", "--only-binary", ":all:", "--no-deps", "-r", str(tools)], check=True, env=env)
    subprocess.run([sys.executable, "-m", "pip", "install", *pillow_heif_install_args(sdist)], check=True, env=env)
    if platform.system() == "Windows":
        for dll in (prefix / "bin").glob("*.dll"):
            shutil.copyfile(dll, _site() / dll.name)


def build() -> dict:
    prefix = Path(sys.prefix) / "formvis-heif" / f"libheif-{LIBHEIF}"
    if prefix.exists():
        shutil.rmtree(prefix)
    say(f"building libde265 {SOURCES['libde265'][0]} and libheif {LIBHEIF} (LGPL-3.0, decoders only) into {prefix}")
    _cmake(_fetch("libde265"), prefix, LIBDE265_FLAGS)
    _cmake(_fetch("libheif"), prefix, LIBHEIF_FLAGS)
    if platform.system() == "Windows":
        _windows_import_library(prefix)
    hits = gpl_hits([prefix])
    if hits:
        raise HeifBuildError(f"the libheif build holds a GPL library: {hits[0]}")
    say(f"building pillow-heif {PILLOW_HEIF} from source against it")
    _pip_pillow_heif(prefix)
    return _verify()


def _child_status() -> dict:
    """status() as a fresh Python reports it. This process must never import pillow-heif itself: Windows refuses to
    replace a library that a running process has loaded, and the reinstall below replaces it."""
    found = subprocess.run([sys.executable, __file__, "--status"], check=True, capture_output=True, text=True).stdout
    return json.loads(found)


def _verify() -> dict:
    s = _child_status()
    if not is_wanted(s):
        raise HeifBuildError(f"pillow-heif is not the decode-only build after installing it: {s}")
    hits = gpl_hits([Path(s["package"]), *[p for p in _site().glob("*x265*")], *[p for p in _site().glob("pillow_heif*.libs")]])
    if hits:
        raise HeifBuildError(f"a GPL library is still installed: {hits[0]}")
    return s


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", nargs="+", type=Path, metavar="PATH")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--force", action="store_true", help="build again even when the installed build is this one")
    args = parser.parse_args(argv)
    if args.check:
        hits = gpl_hits(args.check)
        for hit in hits:
            say(f"GPL codec library: {hit}")
        if not hits:
            say(f"no GPL codec library in {', '.join(str(p) for p in args.check)}")
        return 1 if hits else 0
    if args.status:
        print(json.dumps(status()))
        return 0
    try:
        current = _child_status()
    except (subprocess.CalledProcessError, ValueError) as exc:
        current = {"installed": False, "error": str(exc)}
    if is_wanted(current) and not args.force:
        say(f"HEIC decoding: pillow-heif {PILLOW_HEIF} with libheif {LIBHEIF}, decoders only, already built")
        return 0
    if shutil.which("cmake") is None:
        say("error: cmake is needed to build HEIC decoding (https://cmake.org/download/, brew install cmake, apt install cmake)")
        return 1
    try:
        done = build()
    except (HeifBuildError, subprocess.CalledProcessError, OSError) as exc:
        say(f"error: HEIC decoding could not be built: {exc}")
        return 1
    say(f"HEIC decoding ready: pillow-heif {done['version']}, libheif {done['libheif']}, decoders {done['decoders']}, encoders {done['encoders']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
