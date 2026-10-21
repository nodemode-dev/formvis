# D15: a folder of pictures (the folder picker and a dropped folder share this path) opens its pictures, not "manifest.json was not found".
# D09 and PC-AU-0170: the desktop shell source asks the page before it exits and handles macOS open-documents; read from the repo source
# because the desktop binary is not built here (partial: the exit prompt itself is not driven).
import os
from pathlib import Path

from PIL import Image

REPO = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[1]))
FOLDER = "input[data-cov='folder']"


def folder_input(page):
    page.evaluate("window.formvis.commands.run('open')")
    page.wait_for_function("[...document.querySelectorAll('.cv-scrim:not([hidden]) input[type=file]')].some((i) => i.webkitdirectory)", timeout=10000)
    page.evaluate("[...document.querySelectorAll('.cv-scrim:not([hidden]) input[type=file]')].find((i) => i.webkitdirectory).setAttribute('data-cov', 'folder')")


def test_a_folder_of_pictures_opens_each_picture_as_a_document(page, tmp_path):
    folder = tmp_path / "shots"
    folder.mkdir()
    Image.new("RGB", (30, 20), (200, 10, 10)).save(folder / "one.png")
    Image.new("RGB", (40, 25), (10, 200, 10)).save(folder / "two.png")
    (folder / "notes.txt").write_text("not a picture")
    folder_input(page)
    before = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files(FOLDER, str(folder))
    page.wait_for_function(f"window.formvis.engine.projects.length >= {before + 2}", timeout=30000)
    sizes = page.evaluate("window.formvis.engine.projects.map((p) => [p.doc.width, p.doc.height])")
    assert [30, 20] in sizes and [40, 25] in sizes


def test_a_folder_with_nothing_openable_says_so_and_opens_nothing(page, tmp_path):
    folder = tmp_path / "empty"
    folder.mkdir()
    (folder / "readme.txt").write_text("nothing here")
    folder_input(page)
    before = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files(FOLDER, str(folder))
    page.wait_for_function("document.body.innerText.includes('holds no projects or pictures')", timeout=15000)
    assert page.evaluate("window.formvis.engine.projects.length") == before


def test_shell_source_asks_the_page_before_exit_and_handles_macos_open_documents():
    main = (REPO / "src-tauri" / "src" / "main.rs").read_text()
    assert 'handle.emit("formvis://exit-requested", ())' in main
    assert "RunEvent::ExitRequested" in main and "ask_page_to_quit(handle)" in main and "api.prevent_exit()" in main
    assert "WindowEvent::CloseRequested" in main and "api.prevent_close()" in main
    assert 'cfg(target_os = "macos")' in main and "RunEvent::Opened { urls }" in main
    assert "open_paths(handle, paths)" in main
    disk = (REPO / "frontend" / "src" / "io" / "disk.ts").read_text()
    assert "formvis://exit-requested" in disk and "confirm_exit" in disk
    app = (REPO / "frontend" / "src" / "app.ts").read_text()
    assert "exitRequested: () => { void exitApp(); }" in app and "await settleUnsaved()" in app
