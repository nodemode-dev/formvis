import io

from PIL import Image

from e2e.act_support import SCENE, dialog_open, dlg_button, open_panel, record, set_field, start, steady, undo_all
from e2e.files2_support import downloads, zip_of


def png(color):
    buf = io.BytesIO()
    Image.new("RGB", (10, 6), color).save(buf, "PNG")
    return buf.getvalue()


@steady
def test_batch_plays_the_action_on_each_file_and_names_the_results_from_the_template(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inv", ["invert"])
    undo_all(page, 1)
    dialog_open(page, "batch")
    page.evaluate("[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop().querySelector('input[type=file]:not([webkitdirectory])').dataset.t = '1'")
    page.set_input_files(".cv-dialog input[type=file][data-t='1']", files=[{"name": "red.png", "mimeType": "image/png", "buffer": png((255, 0, 0))}, {"name": "blue.png", "mimeType": "image/png", "buffer": png((0, 0, 255))}])
    page.wait_for_function("document.body.innerText.includes('2 images chosen')", timeout=10000)
    set_field(page, "File name ({name}, {serial}, {date})", "{name}_{serial}")
    set_field(page, "Starting serial", "7")
    page.evaluate("window.__got = []")
    dlg_button(page, "Run")
    name, data = downloads(page, 1, 60000)[0]
    files = zip_of(data)
    assert name == "Inv batch.zip" and list(files) == ["red_007.png", "blue_008.png"]
    red = Image.open(io.BytesIO(files["red_007.png"])).convert("RGB")
    blue = Image.open(io.BytesIO(files["blue_008.png"])).convert("RGB")
    assert red.size == blue.size == (10, 6)
    assert red.getpixel((2, 2)) == (0, 255, 255)
    assert blue.getpixel((2, 2)) == (255, 255, 0)


@steady
def test_batch_include_sub_folders_adds_the_files_of_nested_folders(page, tmp_path):
    (tmp_path / "pics" / "sub").mkdir(parents=True)
    (tmp_path / "pics" / "a.png").write_bytes(png((255, 0, 0)))
    (tmp_path / "pics" / "sub" / "b.png").write_bytes(png((0, 0, 255)))
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inv", ["invert"])
    undo_all(page, 1)
    results = {}
    for sub in (False, True):
        dialog_open(page, "batch")
        set_field(page, "Include All Sub-folders", sub)
        page.evaluate("[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop().querySelector('input[webkitdirectory]').dataset.t = '1'")
        page.set_input_files(".cv-dialog input[data-t='1']", str(tmp_path / "pics"))
        page.wait_for_function(f"document.body.innerText.includes('{2 if sub else 1} image{'s' if sub else ''} chosen')", timeout=10000)
        page.evaluate("window.__got = []")
        dlg_button(page, "Run")
        results[sub] = list(zip_of(downloads(page, 1, 60000)[0][1]))
        page.wait_for_timeout(500)
    assert results == {False: ["a.png"], True: ["a.png", "b.png"]}
