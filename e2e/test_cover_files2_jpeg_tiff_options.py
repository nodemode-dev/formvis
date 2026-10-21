import io

import pytest
import tifffile
from PIL import Image, JpegImagePlugin

from e2e.files2_support import RED, BLUE, click_button, dialog_open, downloads, scene, set_field, steady


def export_as(page, fmt, quality=None, option=None):
    scene(page)
    dialog_open(page, "export-as")
    set_field(page, "Format", fmt)
    if quality:
        set_field(page, "Quality (%)", str(quality))
    if option:
        set_field(page, "Format options", option)
    click_button(page, "Export")
    return downloads(page)[0]


@steady
def test_jpeg_quality_changes_the_quantisation_tables(page, tmp_path):
    low = Image.open(io.BytesIO(export_as(page, "jpg", 10)[1]))
    high = Image.open(io.BytesIO(export_as(page, "jpg", 95)[1]))
    assert low.quantization[0][0] > 40 and high.quantization[0][0] <= 3
    assert sum(low.quantization[0]) > 10 * sum(high.quantization[0])


@pytest.mark.parametrize("option,sampling", [("444", 0), ("422", 1), ("420", 2)])
@steady
def test_jpeg_chroma_subsampling_option_is_written_into_the_file(page, tmp_path, option, sampling):
    name, data = export_as(page, "jpg", 90, option)
    im = Image.open(io.BytesIO(data))
    assert name.endswith(".jpg") and JpegImagePlugin.get_sampling(im) == sampling
    im.load()
    rgb = im.convert("RGB")
    assert all(abs(a - b) <= 12 for a, b in zip(rgb.getpixel((3, 3)), RED))
    assert all(abs(a - b) <= 12 for a, b in zip(rgb.getpixel((12, 8)), BLUE))


@steady
def test_quick_export_follows_export_preferences(page, tmp_path):
    scene(page)
    dialog_open(page, "export-preferences")
    set_field(page, "Quick Export format", "jpg")
    set_field(page, "Quality (%)", "40")
    click_button(page, "Save")
    page.evaluate("window.__got = []")
    page.evaluate("window.formvis.commands.run('quick-export')")
    name, data = downloads(page)[0]
    im = Image.open(io.BytesIO(data))
    assert name.endswith(".jpg") and im.format == "JPEG"
    assert 14 <= im.quantization[0][0] <= 28
    dialog_open(page, "export-preferences")
    set_field(page, "Quick Export format", "png")
    set_field(page, "Quality (%)", "90")
    click_button(page, "Save")


@steady
def test_tiff_lzw_option_writes_an_lzw_rgba_tiff(page, tmp_path):
    name, data = export_as(page, "tiff", None, "lzw")
    im = Image.open(io.BytesIO(data))
    assert name.endswith(".tif") and im.info["compression"] == "tiff_lzw" and im.mode == "RGBA" and im.size == (16, 12)
    assert im.getpixel((3, 3))[:3] == RED and im.getpixel((12, 8))[:3] == BLUE


@steady
def test_tiff_with_layers_command_keeps_layer_names_in_the_image_source_data(page, tmp_path):
    scene(page)
    page.evaluate("window.formvis.commands.run('export-tiff-layers', {layers: true})")
    name, data = downloads(page)[0]
    t = tifffile.TiffFile(io.BytesIO(data))
    p = t.pages[0]
    assert name.endswith(".tif") and p.shape == (12, 16, 4)
    assert 37724 in p.tags and 34377 in p.tags
    assert b"Top" in data and b"Background" in data and b"8BIM" in data
    px = p.asarray()
    assert tuple(px[3, 3][:3]) == RED and tuple(px[8, 12][:3]) == BLUE


TIFF_CASES = [("none", "raw", False), ("packbits", "packbits", False), ("deflate", "tiff_adobe_deflate", False), ("deflate-big", "tiff_adobe_deflate", True), ("none-big", "raw", True)]


@pytest.mark.parametrize("option,compression,big", TIFF_CASES, ids=[c[0] for c in TIFF_CASES])
@steady
def test_tiff_compression_and_bigtiff_options_are_written_into_the_file(page, tmp_path, option, compression, big):
    name, data = export_as(page, "tiff", None, option)
    t = tifffile.TiffFile(io.BytesIO(data))
    assert t.is_bigtiff is big
    im = Image.open(io.BytesIO(data))
    assert im.info["compression"] == compression and im.size == (16, 12)
    assert im.convert("RGB").getpixel((3, 3)) == RED and im.convert("RGB").getpixel((12, 8)) == BLUE


@steady
def test_tiff_grayscale_options_write_two_channels_or_one_flattened_channel(page, tmp_path):
    _, data = export_as(page, "tiff", None, "gray")
    im = Image.open(io.BytesIO(data))
    assert im.mode == "LA" and im.size == (16, 12)
    _, data = export_as(page, "tiff", None, "gray-opaque")
    im = Image.open(io.BytesIO(data))
    assert im.mode == "L" and im.size == (16, 12)
