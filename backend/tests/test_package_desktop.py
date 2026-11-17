"""setup/package_desktop.py (1.99.2): the release steps find the bundles Tauri names after productName (FormVis), on a
case-sensitive Linux file system as well as on macOS and Windows, and still find the lower-case names of older builds."""

import fnmatch
import importlib.util
import json
import tarfile
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("package_desktop", ROOT / "setup" / "package_desktop.py")
pd = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pd)

PRODUCT = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))["productName"]
VERSION = "1.99.2"


def deb_tree(base: Path, name: str, debarch: str = "amd64") -> Path:
    """The staging folder tauri-bundler 2.9 leaves beside the .deb: bundle/deb/<productName>_<version>_<arch>/data."""
    data = base / "src-tauri" / "target" / "release" / "bundle" / "deb" / f"{name}_{VERSION}_{debarch}" / "data"
    (data / "usr" / "bin").mkdir(parents=True)
    (data / "usr" / "bin" / "formvis").write_text("#!/bin/sh\n", encoding="utf-8")
    return data


def test_the_product_name_is_read_from_tauri_conf():
    assert pd.product_name() == PRODUCT == "FormVis"
    assert pd.product_names() == ["FormVis", "formvis"]


def test_linux_tar_finds_the_deb_named_after_the_product(tmp_path, monkeypatch):
    deb_tree(tmp_path, PRODUCT)
    monkeypatch.chdir(tmp_path)
    assert not fnmatch.fnmatchcase(f"{PRODUCT}_{VERSION}_amd64", "formvis_*_amd64"), "the old glob matched the new name"
    assert pd.main(["linux-tar", "--arch", "x64", "--debarch", "amd64"]) == 0
    with tarfile.open(tmp_path / "formvis-linux-x64.tar.gz") as t:
        assert "usr/bin/formvis" in t.getnames()


def test_linux_tar_still_finds_a_lower_case_deb(tmp_path, monkeypatch):
    deb_tree(tmp_path, "formvis", "arm64")
    monkeypatch.chdir(tmp_path)
    assert pd.main(["linux-tar", "--arch", "arm64", "--debarch", "arm64"]) == 0
    assert (tmp_path / "formvis-linux-arm64.tar.gz").is_file()


def test_linux_tar_fails_when_no_deb_was_built(tmp_path, monkeypatch, capsys):
    deb_tree(tmp_path, PRODUCT, "arm64")
    monkeypatch.chdir(tmp_path)
    assert pd.main(["linux-tar", "--arch", "x64", "--debarch", "amd64"]) == 1
    assert "no deb data folder for amd64" in capsys.readouterr().err


@pytest.mark.parametrize("bundle", [PRODUCT, "formvis"])
def test_mac_archive_names_the_update_archive_by_architecture(tmp_path, bundle):
    folder = tmp_path / "bundle" / "macos"
    folder.mkdir(parents=True)
    (folder / f"{bundle}.app.tar.gz").write_bytes(b"archive")
    (folder / f"{bundle}.app.tar.gz.sig").write_text("sig", encoding="utf-8")
    assert pd.main(["mac-archive", "--arch", "aarch64", "--release-dir", str(tmp_path)]) == 0
    assert sorted(p.name for p in folder.iterdir()) == ["formvis_aarch64.app.tar.gz", "formvis_aarch64.app.tar.gz.sig"]
    assert fnmatch.fnmatchcase("formvis_aarch64.app.tar.gz", pd.FEED_TARGETS["darwin-aarch64"])


def test_find_entry_compares_names_exactly(tmp_path):
    (tmp_path / f"{PRODUCT}.app").mkdir()
    assert pd.find_entry(str(tmp_path), [f"{PRODUCT}.app"]) == str(tmp_path / f"{PRODUCT}.app")
    assert pd.find_entry(str(tmp_path), ["formvis.app"]) is None
    assert pd.find_entry(str(tmp_path / "missing"), ["formvis.app"]) is None


def test_the_macos_app_is_the_product_bundle(tmp_path):
    (tmp_path / "bundle" / "macos" / f"{PRODUCT}.app").mkdir(parents=True)
    assert pd.macos_app(str(tmp_path)) == str(tmp_path / "bundle" / "macos" / f"{PRODUCT}.app")
    assert pd.macos_app(str(tmp_path / "none")).endswith(f"{PRODUCT}.app")


@pytest.mark.parametrize("arch", ["amd64", "aarch64"])
def test_zsync_info_matches_the_appimage_tauri_writes(arch, capsys):
    assert pd.main(["zsync-info", "--appimage", arch]) == 0
    kind, owner, repo, tag, pattern = capsys.readouterr().out.strip().split("|")
    assert (kind, owner, repo, tag) == ("gh-releases-zsync", "nodemode-dev", "formvis", "latest")
    assert fnmatch.fnmatchcase(f"{PRODUCT}_{VERSION}_{arch}.AppImage.zsync", pattern)
    assert not fnmatch.fnmatchcase(f"{PRODUCT}_{VERSION}_{arch}.AppImage.zsync", f"formvis_*_{arch}.AppImage.zsync")


def test_the_update_endpoint_is_the_download_store():
    conf = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    assert conf["plugins"]["updater"]["endpoints"] == ["https://dl.formai.studio/formvis/updates/latest.json"]


def test_the_appimage_carries_the_program_its_menu_entry_runs():
    """The deb's desktop template is also the AppImage's, and linuxdeploy's AppRun runs its Exec program from usr/bin,
    so the AppImage must carry formvis-launch as the deb does, or it stops with "Error executing 'formvis-launch'"."""
    conf = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    linux = conf["bundle"]["linux"]
    template = (ROOT / "src-tauri" / linux["deb"]["desktopTemplate"]).read_text(encoding="utf-8")
    program = next(line.split("=", 1)[1].split()[0] for line in template.splitlines() if line.startswith("Exec="))
    for kind in ("deb", "appimage"):
        source = linux[kind]["files"][f"/usr/bin/{program}"]
        assert (ROOT / "src-tauri" / source).is_file(), (kind, source)


def windows_tree(base: Path, engine_in_release: bool) -> Path:
    """A Windows build: formvis.exe in the release folder, the frozen engine in src-tauri/binaries (where the
    installer takes it from), and on a warm cache a copy of the engine beside formvis.exe as well."""
    release = base / "src-tauri" / "target" / "release"
    release.mkdir(parents=True)
    (release / "formvis.exe").write_bytes(b"shell")
    binaries = base / "src-tauri" / "binaries"
    binaries.mkdir(parents=True)
    (binaries / "formvis-engine-x86_64-pc-windows-msvc.exe").write_bytes(b"sidecar")
    if engine_in_release:
        (release / "formvis-engine.exe").write_bytes(b"release")
    return release


def portable_engine(tmp_path, monkeypatch, engine_in_release: bool) -> bytes:
    release = windows_tree(tmp_path, engine_in_release)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(pd, "ROOT", str(tmp_path))
    assert pd.cmd_portable_windows(SimpleNamespace(arch="x64", release_dir=str(release))) == 0
    return (tmp_path / "portable" / "formvis" / "formvis-engine.exe").read_bytes()


def test_the_portable_zip_takes_the_installer_engine_when_the_release_folder_lacks_it(tmp_path, monkeypatch):
    assert portable_engine(tmp_path, monkeypatch, engine_in_release=False) == b"sidecar"


def test_the_portable_zip_prefers_the_release_folder_engine(tmp_path, monkeypatch):
    assert portable_engine(tmp_path, monkeypatch, engine_in_release=True) == b"release"


def test_the_portable_zip_still_fails_with_no_engine_anywhere(tmp_path, monkeypatch):
    release = windows_tree(tmp_path, engine_in_release=False)
    (tmp_path / "src-tauri" / "binaries" / "formvis-engine-x86_64-pc-windows-msvc.exe").unlink()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(pd, "ROOT", str(tmp_path))
    with pytest.raises(FileNotFoundError):
        pd.cmd_portable_windows(SimpleNamespace(arch="x64", release_dir=str(release)))
