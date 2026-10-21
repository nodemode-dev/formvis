import io

from PIL import Image

from e2e.files2_support import BLUE, RED, click_button, dialog_open, downloads, scene, set_field, steady, zip_of


@steady
def test_save_a_copy_downloads_the_copy_and_keeps_the_document_name(page, tmp_path):
    scene(page)
    before = page.evaluate("window.formvis.engine.current.name")
    dialog_open(page, "save-copy")
    set_field(page, "Format", "png")
    click_button(page, "Save")
    name, data = downloads(page)[0]
    assert name == f"{before} copy.png"
    im = Image.open(io.BytesIO(data)).convert("RGB")
    assert im.size == (16, 12) and im.getpixel((3, 3)) == RED and im.getpixel((12, 8)) == BLUE
    assert page.evaluate("window.formvis.engine.current.name") == before


@steady
def test_package_as_psd_zips_the_document(page, tmp_path):
    scene(page)
    dialog_open(page, "package")
    set_field(page, "Document", "psd")
    click_button(page, "Package")
    name, data = downloads(page)[0]
    assert name.endswith("Package.zip")
    files = zip_of(data)
    assert len(files) == 1 and list(files)[0].endswith(".psd")
    psd = next(iter(files.values()))
    assert psd[:4] == b"8BPS"
    from psd_tools import PSDImage
    img = PSDImage.open(io.BytesIO(psd))
    assert (img.width, img.height) == (16, 12) and sorted(l.name for l in img) == ["Background", "Top"]


@steady
def test_generate_image_assets_writes_a_layer_named_with_an_extension(page, tmp_path):
    scene(page)
    page.evaluate("(() => { const e = window.formvis.engine; e.renameLayer(e.current.doc.layers.find((l) => l.name === 'Top').id, 'logo.png'); })()")
    page.evaluate("window.formvis.commands.run('generate-image-assets')")
    name, data = downloads(page)[0]
    files = zip_of(data)
    assert name.endswith("-assets.zip") and list(files) == [name[:-len(".zip")] + "/logo.png"]
    im = Image.open(io.BytesIO(files[list(files)[0]])).convert("RGBA")
    assert im.getpixel((im.width // 2, im.height // 2)) == BLUE + (255,)


@steady
def test_export_luts_writes_cube_3dl_and_csp_for_an_adjustment_layer(page, tmp_path):
    scene(page)
    page.evaluate("window.formvis.engine.addAdjustmentLayer('levels')")
    dialog_open(page, "export-luts")
    click_button(page, "OK")
    name, data = downloads(page)[0]
    files = zip_of(data)
    assert name.endswith("LUTs.zip") and sorted(n.rsplit(".", 1)[1] for n in files) == ["3dl", "csp", "cube"]
    cube = next(v for k, v in files.items() if k.endswith(".cube")).decode().splitlines()
    assert cube[1] == "LUT_3D_SIZE 33" and len([l for l in cube if l and l[0].isdigit()]) == 33 ** 3
    assert cube[3] == "0.000000 0.000000 0.000000"
