import io
import struct

from PIL import Image

from e2e.files2_support import BLUE, PIXEL, click_button, dialog_open, downloads, scene, set_field, steady, zip_of


@steady
def test_image_processor_writes_each_chosen_type_into_its_own_folder_of_a_zip(page, tmp_path):
    scene(page)
    dialog_open(page, "image-processor")
    set_field(page, "Use Open Images", True)
    set_field(page, "Save as JPEG", True)
    set_field(page, "Quality (0 to 12)", "3")
    set_field(page, "Save as PNG", True)
    set_field(page, "Save as TIFF", True)
    click_button(page, "Run")
    name, data = downloads(page, 1, 60000)[0]
    files = zip_of(data)
    assert name == "Image Processor.zip"
    assert sorted(f.split("/")[0] for f in files) == ["JPEG", "PNG", "TIFF"]
    jpg = Image.open(io.BytesIO(files["JPEG/Ex.jpg"]))
    png = Image.open(io.BytesIO(files["PNG/Ex.png"]))
    tif = Image.open(io.BytesIO(files["TIFF/Ex.tif"]))
    assert jpg.format == "JPEG" and png.format == "PNG" and tif.format == "TIFF"
    assert jpg.size == png.size == tif.size == (16, 12)
    assert 20 <= jpg.quantization[0][0] <= 50
    assert png.convert("RGB").getpixel((12, 8)) == BLUE


@steady
def test_save_for_web_exports_a_layer_slice_as_its_own_cropped_file(page, tmp_path):
    scene(page)
    assert page.evaluate("window.formvis.engine.addLayerSlice()") is True
    slices = page.evaluate("window.formvis.engine.current.doc.slices")
    assert [(s["x"], s["y"], s["w"], s["h"]) for s in slices] == [(8, 0, 8, 12)]
    dialog_open(page, "save-for-web")
    set_field(page, "Export", "slices")
    click_button(page, "Save...")
    name, data = downloads(page)[0]
    files = zip_of(data)
    assert name == "Ex slices.zip" and list(files) == ["Ex_01.jpg"]
    im = Image.open(io.BytesIO(files["Ex_01.jpg"]))
    assert im.size == (8, 12)
    assert all(abs(a - b) <= 12 for a, b in zip(im.convert("RGB").getpixel((2, 2)), BLUE))


@steady
def test_swatches_save_writes_an_aco_with_matching_v1_and_v2_blocks(page, tmp_path):
    scene(page)
    page.evaluate("window.formvis.commands.run('swatches-save')")
    name, data = downloads(page)[0]
    assert name == "Swatches.aco"
    v1, n = struct.unpack(">HH", data[:4])
    assert v1 == 1 and n > 0
    v2, n2 = struct.unpack(">HH", data[4 + 10 * n:8 + 10 * n])
    assert v2 == 2 and n2 == n


@steady
def test_preset_manager_exports_swatches_as_ase(page, tmp_path):
    scene(page)
    dialog_open(page, "preset-manager")
    page.evaluate("[...[...document.querySelectorAll('.cv-dialog')].filter((d) => d.offsetParent).pop().querySelectorAll('button')].find((b) => b.textContent.includes('.ase')).click()")
    name, data = downloads(page)[0]
    assert name == "Swatches.ase" and data[:4] == b"ASEF"
    assert struct.unpack(">HH", data[4:8]) == (1, 0)
    assert struct.unpack(">I", data[8:12])[0] > 0


@steady
def test_new_from_clipboard_makes_a_document_the_size_of_the_copied_selection(page, tmp_path):
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    scene(page)
    page.evaluate("(async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.applySelection(E.SelectionMask.cropped(6, 1, 8, 5, new Uint8Array(40).fill(255)), 'replace', 's'); })()")
    page.evaluate("window.formvis.commands.run('copy')")
    page.wait_for_timeout(500)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate("window.formvis.commands.run('new-from-clipboard')")
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=15000)
    assert page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [8, 5]
    assert page.evaluate(PIXEL, [0, 1])[3] == 0
    assert page.evaluate(PIXEL, [5, 1])[:3] == list(BLUE)
