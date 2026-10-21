import io

from PIL import Image

from e2e.act_support import SCENE, dialog_open, dlg_button, open_panel, px, record, set_field, start, steady, toast_text, undo_all
from e2e.files2_support import downloads, zip_of


def png(color):
    buf = io.BytesIO()
    Image.new("RGB", (10, 6), color).save(buf, "PNG")
    return buf.getvalue()


@steady
def test_browse_runs_the_chosen_script_file_in_the_sandbox(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    script = tmp_path / "flip.js"
    script.write_text("log('inverting'); await run('invert', {}); return 1;")
    before = page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(12, 2, 1, 1).data.join()")
    with page.expect_file_chooser(timeout=10000) as chooser:
        page.evaluate("window.formvis.commands.run('script-browse')")
    chooser.value.set_files(str(script))
    page.wait_for_function("document.body.innerText.includes('Ran flip.js: inverting')", timeout=10000)
    after = page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(12, 2, 1, 1).data.join()")
    assert before == "30,40,220,255" and after == "225,215,35,255"


@steady
def test_browse_reports_a_script_that_stops(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    script = tmp_path / "bad.js"
    script.write_text("await run('no-such-command-id', {}); return 1;")
    with page.expect_file_chooser(timeout=10000) as chooser:
        page.evaluate("window.formvis.commands.run('script-browse')")
    chooser.value.set_files(str(script))
    page.wait_for_function("document.body.innerText.includes('bad.js stopped')", timeout=10000)
    assert page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(12, 2, 1, 1).data.join()") == "30,40,220,255"


@steady
def test_image_processor_writes_each_type_into_its_own_folder_after_an_action(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    open_panel(page)
    record(page, "Inv", ["invert"])
    undo_all(page, 1)
    dialog_open(page, "image-processor")
    page.evaluate("[...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop().querySelector('input[type=file]:not([webkitdirectory])').dataset.t = '1'")
    page.set_input_files(".cv-dialog input[type=file][data-t='1']", files=[{"name": "red.png", "mimeType": "image/png", "buffer": png((255, 0, 0))}, {"name": "blue.png", "mimeType": "image/png", "buffer": png((0, 0, 255))}])
    page.wait_for_function("document.body.innerText.includes('2 images chosen')", timeout=10000)
    set_field(page, "Save as PNG", True)
    set_field(page, "Save as TGA", True)
    set_field(page, "Save as DPX", True)
    set_field(page, "Run Action", True)
    page.evaluate("window.__got = []")
    dlg_button(page, "Run")
    name, data = downloads(page, 1, 60000)[0]
    files = zip_of(data)
    assert name == "Image Processor.zip"
    assert sorted(files) == ["DPX/blue.dpx", "DPX/red.dpx", "JPEG/blue.jpg", "JPEG/red.jpg", "PNG/blue.png", "PNG/red.png", "TGA/blue.tga", "TGA/red.tga"]
    red = Image.open(io.BytesIO(files["PNG/red.png"])).convert("RGB")
    blue = Image.open(io.BytesIO(files["PNG/blue.png"])).convert("RGB")
    assert red.size == blue.size == (10, 6)
    assert red.getpixel((2, 2)) == (0, 255, 255) and blue.getpixel((2, 2)) == (255, 255, 0)
    tga = Image.open(io.BytesIO(files["TGA/red.tga"])).convert("RGB")
    assert tga.size == (10, 6) and tga.getpixel((2, 2)) == (0, 255, 255)
