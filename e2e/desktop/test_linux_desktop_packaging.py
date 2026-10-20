"""Linux packaging and start-up rows read for real: the desktop entry, MIME list, AppStream file, Flatpak manifest and deb config are
parsed and cross-checked; setup/libcheck runs against the debug binary and against a fake ldd; the engine's --user-data-dir,
--portable and one-engine-per-data-folder lock run in separate processes. None of this needs the window."""
import json
import os
import re
import stat
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import yaml

from e2e.desktop import support

ROOT = Path(__file__).resolve().parents[2]
LINUX = ROOT / "packaging" / "linux"
APP_ID = "ai.nodemode.formvis"


def desktop_entry() -> dict:
    out = {}
    for line in (LINUX / f"{APP_ID}.desktop").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, _, value = line.partition("=")
            out[key] = value
    return out


def tauri_conf() -> dict:
    return json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text())


def test_the_desktop_entry_names_the_app_the_category_and_every_opened_type():
    entry = desktop_entry()
    assert entry["Type"] == "Application" and entry["Name"] == "formvis" and entry["Terminal"] == "false"
    assert entry["Exec"] == "formvis %F", "a file manager passes the picked files as arguments"
    assert entry["Icon"] == APP_ID and entry["StartupWMClass"] == "formvis"
    categories = entry["Categories"].rstrip(";").split(";")
    assert "Graphics" in categories and "RasterGraphics" in categories
    mimes = entry["MimeType"].rstrip(";").split(";")
    for wanted in ("application/x-formvis", "image/vnd.adobe.photoshop", "image/openraster", "image/png", "image/jpeg", "image/tiff", "image/webp", "image/x-exr"):
        assert wanted in mimes, wanted
    assert len(mimes) == len(set(mimes)), "no MIME type listed twice"


def test_the_shared_mime_file_defines_the_types_the_entry_lists_that_the_system_lacks():
    root = ET.parse(LINUX / f"{APP_ID}.xml").getroot()
    ns = "{http://www.freedesktop.org/standards/shared-mime-info}"
    types = {t.get("type"): [g.get("pattern") for g in t.findall(f"{ns}glob")] for t in root.findall(f"{ns}mime-type")}
    assert set(types["application/x-formvis"]) == {"*.fvd", "*.fmv", "*.formvis"}
    assert types["image/openraster"] == ["*.ora"] and types["image/x-exr"] == ["*.exr"]
    defined_here = set(types)
    listed = set(desktop_entry()["MimeType"].rstrip(";").split(";"))
    assert defined_here <= listed


def test_the_tauri_file_associations_cover_the_same_extensions_the_mime_file_and_entry_declare():
    associations = tauri_conf()["bundle"]["fileAssociations"]
    extensions = {e for item in associations for e in item["ext"]}
    assert {"fvd", "fmv", "formvis", "psd", "psb", "png", "jpg", "jpeg", "tif", "tiff", "webp", "exr", "ora"} <= extensions
    project = next(a for a in associations if "fmv" in a["ext"])
    assert project["mimeType"] == "application/x-formvis"
    assert tauri_conf()["bundle"]["category"] == "GraphicsAndDesign"


def test_the_appstream_file_is_well_formed_and_points_at_the_desktop_entry():
    root = ET.parse(LINUX / f"{APP_ID}.metainfo.xml").getroot()
    assert root.get("type") == "desktop-application"
    assert root.findtext("id") == APP_ID
    assert root.findtext("launchable") == f"{APP_ID}.desktop"
    assert (LINUX / root.findtext("launchable")).is_file()
    assert root.findtext("project_license") == "Apache-2.0" and root.findtext("metadata_license") == "CC0-1.0"
    assert root.find("provides/binary").text == "formvis"


def test_the_flatpak_manifest_installs_the_three_linux_files_and_holds_the_sandbox_to_what_the_app_needs():
    manifest = yaml.safe_load((ROOT / "packaging" / "flatpak" / f"{APP_ID}.yml").read_text())
    assert manifest["app-id"] == APP_ID and manifest["command"] == "formvis"
    args = set(manifest["finish-args"])
    assert {"--share=ipc", "--socket=x11", "--socket=wayland", "--device=dri"} <= args
    assert not any(a in args for a in ("--filesystem=host", "--filesystem=home", "--socket=session-bus", "--socket=system-bus"))
    commands = "\n".join(manifest["modules"][0]["build-commands"])
    for name in (f"{APP_ID}.desktop", f"{APP_ID}.xml", f"{APP_ID}.metainfo.xml"):
        assert name in commands and (LINUX / name).is_file()
    sources = manifest["modules"][0]["sources"]
    assert {tuple(s["only-arches"]) for s in sources if s.get("type") == "file" and "only-arches" in s} == {("x86_64",), ("aarch64",)}


def test_the_deb_config_ships_libcheck_and_recommends_the_portal():
    deb = tauri_conf()["bundle"]["linux"]["deb"]
    assert deb["files"] == {"/usr/share/formvis/libcheck": "../setup/libcheck"}
    assert (ROOT / "src-tauri" / "../setup/libcheck").resolve().is_file()
    assert any("xdg-desktop-portal" in r for r in deb["recommends"])


def run_libcheck(*args: str, path_dir: Path | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
    base = {"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", "/root"), **(env or {})}
    if path_dir:
        base["PATH"] = f"{path_dir}:{base['PATH']}"
    return subprocess.run(["bash", str(ROOT / "setup" / "libcheck"), *args], capture_output=True, text=True, env=base, timeout=60)


def test_libcheck_passes_on_the_real_debug_binary_when_it_links_everything():
    binary = support.find_binary()
    if binary is None:
        pytest.skip("no desktop binary")
    out = run_libcheck(str(binary))
    real = subprocess.run(["ldd", str(binary)], capture_output=True, text=True).stdout
    if "not found" in real:
        assert out.returncode == 1 and "cannot find" in out.stdout
    else:
        assert out.returncode == 0, out.stdout
        assert "finds every library it links" in out.stdout


def test_libcheck_names_each_missing_library_and_the_package_to_install(tmp_path):
    fake = tmp_path / "bin"
    fake.mkdir()
    ldd = fake / "ldd"
    ldd.write_text("#!/bin/sh\nprintf '\\tlibwebkit2gtk-4.1.so.0 => not found\\n\\tlibgtk-3.so.0 => /usr/lib/libgtk-3.so.0 (0x1)\\n\\tlibxdo.so.3 => not found\\n'\n")
    ldd.chmod(ldd.stat().st_mode | stat.S_IEXEC)
    program = tmp_path / "formvis"
    program.write_text("x")
    out = run_libcheck(str(program), path_dir=fake)
    assert out.returncode == 1
    assert "libwebkit2gtk-4.1.so.0" in out.stdout and "libxdo.so.3" in out.stdout
    assert "libgtk-3.so.0" not in out.stdout.split("file dialogs:")[0].split("cannot find:")[1]
    assert "sudo apt install" in out.stdout and "file dialogs:" in out.stdout


def test_libcheck_dialogs_reports_the_display_session_bus_and_tools(tmp_path):
    out = run_libcheck("--dialogs", str(Path(sys.executable)), env={"DISPLAY": ":77", "DBUS_SESSION_BUS_ADDRESS": "unix:path=/nonexistent", "XDG_SESSION_TYPE": "x11"})
    assert "file dialogs:" in out.stdout
    assert "session: x11, DISPLAY=:77" in out.stdout
    assert "session bus: present" in out.stdout
    nodisplay = run_libcheck("--dialogs", str(Path(sys.executable)))
    assert "no display is set" in nodisplay.stdout or "DISPLAY=" in nodisplay.stdout
    quiet = run_libcheck("--quiet", str(Path(sys.executable)))
    assert quiet.stdout == "" and quiet.returncode in (0, 1)


def in_backend(code: str, env: dict | None = None, timeout: float = 60) -> subprocess.CompletedProcess:
    full = {"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", "/root"), "PYTHONPATH": str(ROOT / "backend"), **(env or {})}
    return subprocess.run([sys.executable, "-s", "-c", code], capture_output=True, text=True, env=full, timeout=timeout, cwd=str(ROOT / "backend"))


def test_user_data_dir_switch_moves_the_data_folder_and_reports_an_override(tmp_path):
    chosen = tmp_path / "mine"
    code = ("import json;from app.core import runtime, config;"
            f"rest=runtime.apply_switches(['--user-data-dir','{chosen}','keep.png']);"
            "print(json.dumps([rest,str(config.data_dir()),config.data_dir_source()]))")
    out = in_backend(code, {"HOME": str(tmp_path / "home")})
    assert out.returncode == 0, out.stderr
    rest, data, source = json.loads(out.stdout.strip().splitlines()[-1])
    assert rest == ["keep.png"] and data == str(chosen) and source == "override" and chosen.is_dir()
    equals = in_backend(f"from app.core import runtime, config;runtime.apply_switches(['--user-data-dir={chosen}-b']);print(config.data_dir())", {"HOME": str(tmp_path / "home")})
    assert equals.stdout.strip().endswith("mine-b")


def test_portable_switch_keeps_the_data_beside_the_program_and_a_marker_file_does_the_same(tmp_path):
    home = tmp_path / "home"
    code = "from app.core import runtime, config;runtime.apply_switches(['--portable']);print(config.data_dir());print(config.data_dir_source())"
    out = in_backend(code, {"HOME": str(home)})
    assert out.returncode == 0, out.stderr
    path, source = out.stdout.strip().splitlines()[-2:]
    assert source == "portable" and Path(path).name == "FormvisData"
    assert not (home / "Formvis").exists() and not (home / ".local" / "share" / "formvis").exists()
    plain = in_backend("from app.core import config;print(config.data_dir());print(config.data_dir_source())", {"HOME": str(home), "XDG_DATA_HOME": str(home / "xdg")})
    assert plain.stdout.strip().splitlines()[-1] == "default"
    assert plain.stdout.strip().splitlines()[-2] == str(home / "xdg" / "formvis")


def test_a_second_engine_on_the_same_data_folder_is_refused_and_a_dead_lock_is_replaced(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    holder = subprocess.Popen([sys.executable, "-s", "-c",
                               "import sys,time;from pathlib import Path;from app.core import runtime;runtime.claim(Path(sys.argv[1]));print('held',flush=True);time.sleep(60)", str(data)],
                              stdout=subprocess.PIPE, text=True, cwd=str(ROOT / "backend"), env={"PATH": os.environ["PATH"], "PYTHONPATH": str(ROOT / "backend")})
    try:
        assert holder.stdout.readline().strip() == "held"
        lock = json.loads((data / "engine.lock").read_text())
        assert lock["pid"] == holder.pid
        second = subprocess.run([sys.executable, "-s", "-c",
                                 "import sys;from pathlib import Path;from app.core import runtime\ntry:\n    runtime.claim(Path(sys.argv[1]))\nexcept runtime.AlreadyRunning as e:\n    print('refused', e);sys.exit(2)", str(data)],
                                capture_output=True, text=True, cwd=str(ROOT / "backend"), env={"PATH": os.environ["PATH"], "PYTHONPATH": str(ROOT / "backend")})
        assert second.returncode == 2 and "refused" in second.stdout and str(holder.pid) in second.stdout
    finally:
        holder.terminate()
        holder.wait(timeout=20)
    other = tmp_path / "other"
    other.mkdir()
    free = subprocess.run([sys.executable, "-s", "-c", "import sys;from pathlib import Path;from app.core import runtime;runtime.claim(Path(sys.argv[1]));print('ok')", str(other)],
                          capture_output=True, text=True, cwd=str(ROOT / "backend"), env={"PATH": os.environ["PATH"], "PYTHONPATH": str(ROOT / "backend")})
    assert free.stdout.strip() == "ok", "a different data folder has its own engine"
    replaced = subprocess.run([sys.executable, "-s", "-c", "import sys;from pathlib import Path;from app.core import runtime;runtime.claim(Path(sys.argv[1]));print('ok')", str(data)],
                              capture_output=True, text=True, cwd=str(ROOT / "backend"), env={"PATH": os.environ["PATH"], "PYTHONPATH": str(ROOT / "backend")})
    assert replaced.stdout.strip() == "ok", "the lock of a process that is gone is replaced"
