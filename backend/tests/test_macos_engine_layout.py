"""The macOS engine folder must leave setup/freeze_backend exactly as Tauri ships it (1.99.5).

Tauri copies resources one file at a time: a linked file arrives as a plain copy and a linked folder is dropped.
PyInstaller links `_internal/Python` and `Python.framework/Python` to the framework's library, and Apple's notary
rejected those two copies ("The signature of the binary is invalid"), so `flatten_engine` removes every link and the
framework before the engine is signed.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(
    sys.platform != "darwin" or not shutil.which("codesign") or not shutil.which("otool"),
    reason="needs macOS with codesign and otool",
)


def _run_flatten(engine: Path) -> subprocess.CompletedProcess:
    text = (ROOT / "setup/freeze_backend").read_text()
    body = re.search(r"^flatten_engine\(\) \{\n.*?^\}\n", text, re.S | re.M)
    assert body, "setup/freeze_backend lost flatten_engine"
    script = engine.parent / "flatten.sh"
    script.write_text(
        "cv_say() { printf '[formvis] %s\\n' \"$*\"; }\n"
        "cv_die() { printf '[formvis] error: %s\\n' \"$*\" >&2; exit 1; }\n"
        + body.group(0)
        + 'flatten_engine "$1"\n'
    )
    return subprocess.run(["bash", str(script), str(engine)], capture_output=True, text=True)


def _pyinstaller_layout(tmp_path: Path) -> Path:
    """The layout PyInstaller 6 writes for a framework Python, with a real Mach-O file standing in for the library."""
    engine = tmp_path / "engine"
    internal = engine / "_internal"
    version = internal / "Python.framework/Versions/3.14"
    (version / "Resources").mkdir(parents=True)
    (version / "Resources/Info.plist").write_text("<plist/>")
    shutil.copy("/usr/bin/true", version / "Python")
    os.symlink("3.14", internal / "Python.framework/Versions/Current")
    os.symlink("Versions/Current/Python", internal / "Python.framework/Python")
    os.symlink("Versions/Current/Resources", internal / "Python.framework/Resources")
    os.symlink("Python.framework/Versions/3.14/Python", internal / "Python")
    (internal / "pkg/.dylibs").mkdir(parents=True)
    (internal / "pkg/.dylibs/data.txt").write_text("kept")
    os.symlink("pkg/.dylibs", internal / "linked_dir")
    os.symlink("pkg/.dylibs/data.txt", internal / "linked_file.txt")
    return engine


def test_the_engine_leaves_with_no_links_and_no_framework(tmp_path):
    engine = _pyinstaller_layout(tmp_path)
    result = _run_flatten(engine)
    assert result.returncode == 0, result.stderr
    internal = engine / "_internal"
    assert not [p for p in engine.rglob("*") if p.is_symlink()]
    assert not (internal / "Python.framework").exists()
    python = internal / "Python"
    assert python.is_file() and not python.is_symlink()
    subprocess.run(["codesign", "--verify", "--strict", str(python)], check=True)
    assert (internal / "linked_dir/data.txt").read_text() == "kept"
    assert (internal / "linked_file.txt").read_text() == "kept"


def test_another_framework_stops_the_build(tmp_path):
    engine = _pyinstaller_layout(tmp_path)
    (engine / "_internal/Qt.framework/Versions/A").mkdir(parents=True)
    result = _run_flatten(engine)
    assert result.returncode != 0
    assert "Qt.framework" in result.stderr


def test_freeze_backend_flattens_before_it_signs():
    text = (ROOT / "setup/freeze_backend").read_text()
    flatten = text.index('flatten_engine "$out"')
    assert text.index('cp -R dist-engine/formvis-engine "$out"') < flatten < text.index('sign_engine "$out"')
