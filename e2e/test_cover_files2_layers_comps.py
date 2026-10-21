import io

from PIL import Image

from e2e.files2_support import BLUE, RED, click_button, dialog_open, downloads, scene, set_field, steady, zip_of


def rgba(data):
    im = Image.open(io.BytesIO(data))
    im.load()
    return im.convert("RGBA")


@steady
def test_layers_to_files_dialog_writes_one_png_per_layer_in_a_zip(page, tmp_path):
    scene(page)
    dialog_open(page, "export-layers")
    set_field(page, "File name prefix", "pre")
    set_field(page, "File type", "png")
    click_button(page, "Export")
    name, data = downloads(page)[0]
    assert name == "Ex layers.zip"
    files = zip_of(data)
    assert sorted(files) == ["pre_0000_Top.png", "pre_0001_Background.png"]
    top, base = rgba(files["pre_0000_Top.png"]), rgba(files["pre_0001_Background.png"])
    assert top.size == base.size == (16, 12)
    assert top.getpixel((3, 3))[3] == 0 and top.getpixel((12, 8)) == BLUE + (255,)
    assert base.getpixel((3, 3)) == RED + (255,) and base.getpixel((12, 8)) == RED + (255,)


@steady
def test_layers_to_files_visible_only_skips_a_hidden_layer_and_jpeg_has_no_alpha(page, tmp_path):
    scene(page)
    page.evaluate("window.formvis.engine.current.doc.layers.find((l) => l.name === 'Top').visible = false")
    dialog_open(page, "export-layers")
    set_field(page, "File name prefix", "v")
    set_field(page, "File type", "jpg")
    set_field(page, "Visible layers only", True)
    click_button(page, "Export")
    files = zip_of(downloads(page)[0][1])
    assert list(files) == ["v_0000_Background.jpg"]
    im = Image.open(io.BytesIO(files["v_0000_Background.jpg"]))
    assert im.format == "JPEG" and im.mode == "RGB"


@steady
def test_layer_comps_to_files_writes_each_comp_and_restores_the_document(page, tmp_path):
    scene(page)
    page.evaluate("window.formvis.engine.newLayerComp({name: 'Both'})")
    page.evaluate("(() => { const e = window.formvis.engine; e.current.doc.layers.find((l) => l.name === 'Top').visible = false; e.newLayerComp({name: 'OnlyBase'}); })()")
    dialog_open(page, "export-layer-comps")
    set_field(page, "File name prefix", "c")
    set_field(page, "File type", "png")
    click_button(page, "Export")
    files = zip_of(downloads(page)[0][1])
    assert sorted(files) == ["c_0000_Both.png", "c_0001_OnlyBase.png"]
    both, only = rgba(files["c_0000_Both.png"]), rgba(files["c_0001_OnlyBase.png"])
    assert both.getpixel((12, 8))[:3] == BLUE and only.getpixel((12, 8))[:3] == RED
    assert both.getpixel((3, 3))[:3] == RED and only.getpixel((3, 3))[:3] == RED
    assert page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name + ':' + l.visible)") == ["Background:true", "Top:false"]
